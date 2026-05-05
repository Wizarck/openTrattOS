"""End-to-end FastAPI tests with mocked LightRAG + Brave."""

from __future__ import annotations

from typing import Any

import httpx
import respx
from fastapi.testclient import TestClient

from rag_proxy.brave_client import BraveClient
from rag_proxy.config import Settings
from rag_proxy.lightrag_client import LightRagClient
from rag_proxy.main import create_app


def _build_client(settings: Settings) -> TestClient:
    lightrag = LightRagClient(settings)
    brave = BraveClient(settings)
    app = create_app(settings=settings, lightrag_client=lightrag, brave_client=brave)
    return TestClient(app)


def _auth_headers(settings: Settings) -> dict[str, str]:
    return {"Authorization": f"Bearer {settings.RAG_PROXY_API_KEY}"}


def _brave_response(results: list[dict[str, Any]]) -> dict[str, Any]:
    return {"web": {"results": results}}


@respx.mock
def test_lightrag_clean_json_path(base_settings: Settings) -> None:
    respx.post("http://lightrag.test:9621/query").mock(
        return_value=httpx.Response(
            200,
            json={
                "response": '{"value": 0.65, "citationUrl": "https://fdc.nal.usda.gov/x", "snippet": "USDA: beef chuck yield 60-70%."}',
                "references": [],
            },
        )
    )
    client = _build_client(base_settings)
    response = client.post(
        "/query",
        json={"kind": "yield", "query": "beef chuck yield"},
        headers=_auth_headers(base_settings),
    )
    assert response.status_code == 200
    body = response.json()
    assert body is not None
    assert body["value"] == 0.65
    assert body["citationUrl"] == "https://fdc.nal.usda.gov/x"


@respx.mock
def test_lightrag_unparseable_then_brave_fallback_succeeds(base_settings: Settings) -> None:
    """LightRAG returns prose twice (initial + retry); Brave finds USDA result; small LLM call extracts value."""
    lightrag_route = respx.post("http://lightrag.test:9621/query").mock(
        side_effect=[
            httpx.Response(200, json={"response": "I don't know.", "references": []}),
            httpx.Response(200, json={"response": "Still don't know.", "references": []}),
            httpx.Response(
                200,
                json={"response": '{"value": 0.7}', "references": []},
            ),
        ]
    )
    respx.get("https://api.search.brave.com/res/v1/web/search").mock(
        return_value=httpx.Response(
            200,
            json=_brave_response(
                [
                    {
                        "url": "https://fdc.nal.usda.gov/foo",
                        "title": "USDA",
                        "description": "Beef yield is approximately 70% after cooking.",
                    }
                ]
            ),
        )
    )
    client = _build_client(base_settings)
    response = client.post(
        "/query",
        json={"kind": "yield", "query": "beef yield"},
        headers=_auth_headers(base_settings),
    )
    assert response.status_code == 200
    body = response.json()
    assert body is not None
    assert body["value"] == 0.7
    assert body["citationUrl"] == "https://fdc.nal.usda.gov/foo"
    # 2 LightRAG primary calls (initial + retry) + 1 brave-extract LightRAG call = 3
    assert lightrag_route.call_count == 3


@respx.mock
def test_both_paths_fail_returns_null(base_settings: Settings) -> None:
    respx.post("http://lightrag.test:9621/query").mock(
        return_value=httpx.Response(200, json={"response": "no idea", "references": []})
    )
    respx.get("https://api.search.brave.com/res/v1/web/search").mock(
        return_value=httpx.Response(
            200,
            json=_brave_response(
                [{"url": "https://reddit.com/r/x", "title": "R", "description": "blog talk"}]
            ),
        )
    )
    client = _build_client(base_settings)
    response = client.post(
        "/query",
        json={"kind": "waste", "query": "what about this?"},
        headers=_auth_headers(base_settings),
    )
    assert response.status_code == 200
    assert response.json() is None


def test_missing_bearer_returns_401(base_settings: Settings) -> None:
    client = _build_client(base_settings)
    response = client.post(
        "/query",
        json={"kind": "yield", "query": "x"},
    )
    assert response.status_code == 401


def test_wrong_bearer_returns_401(base_settings: Settings) -> None:
    client = _build_client(base_settings)
    response = client.post(
        "/query",
        json={"kind": "yield", "query": "x"},
        headers={"Authorization": "Bearer wrong"},
    )
    assert response.status_code == 401


@respx.mock
def test_health_endpoint(base_settings: Settings) -> None:
    respx.get("http://lightrag.test:9621/health").mock(return_value=httpx.Response(200))
    client = _build_client(base_settings)
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["lightrag"] is True
    assert body["brave"] is True


@respx.mock
def test_brave_disabled_skips_fallback(base_settings: Settings) -> None:
    settings = base_settings.model_copy(update={"BRAVE_ENABLED": False})
    respx.post("http://lightrag.test:9621/query").mock(
        return_value=httpx.Response(200, json={"response": "no idea", "references": []})
    )
    brave_route = respx.get("https://api.search.brave.com/res/v1/web/search")
    client = _build_client(settings)
    response = client.post(
        "/query",
        json={"kind": "yield", "query": "x"},
        headers=_auth_headers(settings),
    )
    assert response.status_code == 200
    assert response.json() is None
    assert brave_route.call_count == 0


@respx.mock
def test_iron_rule_filters_invalid_lightrag_response(base_settings: Settings) -> None:
    respx.post("http://lightrag.test:9621/query").mock(
        return_value=httpx.Response(
            200,
            json={
                "response": '{"value": 1.5, "citationUrl": "https://x", "snippet": "y"}',
                "references": [],
            },
        )
    )
    respx.get("https://api.search.brave.com/res/v1/web/search").mock(
        return_value=httpx.Response(200, json=_brave_response([]))
    )
    client = _build_client(base_settings)
    response = client.post(
        "/query",
        json={"kind": "yield", "query": "x"},
        headers=_auth_headers(base_settings),
    )
    assert response.status_code == 200
    assert response.json() is None


@respx.mock
def test_validation_error_on_bad_request(base_settings: Settings) -> None:
    client = _build_client(base_settings)
    response = client.post(
        "/query",
        json={"kind": "invalid", "query": "x"},
        headers=_auth_headers(base_settings),
    )
    # FastAPI/pydantic returns 422 for validation errors before bearer check fires
    assert response.status_code == 422


@respx.mock
def test_empty_query_rejected(base_settings: Settings) -> None:
    client = _build_client(base_settings)
    response = client.post(
        "/query",
        json={"kind": "yield", "query": ""},
        headers=_auth_headers(base_settings),
    )
    assert response.status_code == 422
