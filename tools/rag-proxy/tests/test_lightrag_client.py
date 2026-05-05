"""LightRAG client failure-mode coverage. All failures collapse to None."""

from __future__ import annotations

import httpx
import pytest
import respx

from rag_proxy.config import Settings
from rag_proxy.lightrag_client import LightRagClient


@pytest.mark.asyncio
@respx.mock
async def test_query_success(base_settings: Settings) -> None:
    respx.post("http://lightrag.test:9621/query").mock(
        return_value=httpx.Response(
            200,
            json={
                "response": '{"value": 0.5, "citationUrl": "https://x", "snippet": "y"}',
                "references": [{"reference_id": "r1", "file_path": "/a.json", "content": ["c"]}],
            },
        )
    )
    client = LightRagClient(base_settings)
    result = await client.query("q", "user_prompt")
    assert result is not None
    assert "0.5" in result.response


@pytest.mark.asyncio
@respx.mock
async def test_query_401_returns_none(base_settings: Settings) -> None:
    respx.post("http://lightrag.test:9621/query").mock(
        return_value=httpx.Response(401, text="unauthorized")
    )
    client = LightRagClient(base_settings)
    assert await client.query("q", "p") is None


@pytest.mark.asyncio
@respx.mock
async def test_query_500_returns_none(base_settings: Settings) -> None:
    respx.post("http://lightrag.test:9621/query").mock(
        return_value=httpx.Response(500, text="boom")
    )
    client = LightRagClient(base_settings)
    assert await client.query("q", "p") is None


@pytest.mark.asyncio
@respx.mock
async def test_query_network_error_returns_none(base_settings: Settings) -> None:
    respx.post("http://lightrag.test:9621/query").mock(
        side_effect=httpx.ConnectError("conn refused")
    )
    client = LightRagClient(base_settings)
    assert await client.query("q", "p") is None


@pytest.mark.asyncio
@respx.mock
async def test_query_timeout_returns_none(base_settings: Settings) -> None:
    respx.post("http://lightrag.test:9621/query").mock(
        side_effect=httpx.ReadTimeout("slow")
    )
    client = LightRagClient(base_settings)
    assert await client.query("q", "p") is None


@pytest.mark.asyncio
@respx.mock
async def test_query_invalid_json_returns_none(base_settings: Settings) -> None:
    respx.post("http://lightrag.test:9621/query").mock(
        return_value=httpx.Response(200, text="<html>not json</html>")
    )
    client = LightRagClient(base_settings)
    assert await client.query("q", "p") is None


@pytest.mark.asyncio
@respx.mock
async def test_query_validation_error_returns_none(base_settings: Settings) -> None:
    respx.post("http://lightrag.test:9621/query").mock(
        return_value=httpx.Response(200, json={"unexpected": "shape"})
    )
    client = LightRagClient(base_settings)
    assert await client.query("q", "p") is None


@pytest.mark.asyncio
@respx.mock
async def test_query_sends_api_key_header(base_settings: Settings) -> None:
    route = respx.post("http://lightrag.test:9621/query").mock(
        return_value=httpx.Response(200, json={"response": "{}", "references": []})
    )
    client = LightRagClient(base_settings)
    await client.query("q", "p")
    assert route.called
    assert route.calls[0].request.headers.get("X-API-Key") == "lightrag-test-key"


@pytest.mark.asyncio
@respx.mock
async def test_healthcheck_ok(base_settings: Settings) -> None:
    respx.get("http://lightrag.test:9621/health").mock(return_value=httpx.Response(200))
    client = LightRagClient(base_settings)
    assert await client.healthcheck() is True


@pytest.mark.asyncio
@respx.mock
async def test_healthcheck_fail(base_settings: Settings) -> None:
    respx.get("http://lightrag.test:9621/health").mock(side_effect=httpx.ConnectError("nope"))
    client = LightRagClient(base_settings)
    assert await client.healthcheck() is False
