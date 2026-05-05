"""Brave client: whitelist + budget + failure modes."""

from __future__ import annotations

from datetime import UTC, datetime

import httpx
import pytest
import respx

from rag_proxy.brave_client import BraveBudget, BraveClient
from rag_proxy.config import Settings


def _brave_response(results: list[dict[str, str]]) -> dict[str, object]:
    return {"web": {"results": results}}


@pytest.mark.asyncio
@respx.mock
async def test_search_returns_first_whitelisted(base_settings: Settings) -> None:
    respx.get("https://api.search.brave.com/res/v1/web/search").mock(
        return_value=httpx.Response(
            200,
            json=_brave_response(
                [
                    {"url": "https://reddit.com/r/x", "title": "Reddit", "description": "no"},
                    {
                        "url": "https://fdc.nal.usda.gov/fdc-app.html",
                        "title": "USDA",
                        "description": "yes",
                    },
                ]
            ),
        )
    )
    client = BraveClient(base_settings)
    result = await client.search("beef")
    assert result is not None
    assert result.url == "https://fdc.nal.usda.gov/fdc-app.html"


@pytest.mark.asyncio
@respx.mock
async def test_search_all_filtered_returns_none(base_settings: Settings) -> None:
    respx.get("https://api.search.brave.com/res/v1/web/search").mock(
        return_value=httpx.Response(
            200,
            json=_brave_response(
                [
                    {"url": "https://reddit.com/r/x", "title": "R", "description": "no"},
                    {"url": "https://medium.com/y", "title": "M", "description": "no"},
                ]
            ),
        )
    )
    client = BraveClient(base_settings)
    assert await client.search("beef") is None


@pytest.mark.asyncio
async def test_search_disabled_returns_none(base_settings: Settings) -> None:
    settings = base_settings.model_copy(update={"BRAVE_ENABLED": False})
    client = BraveClient(settings)
    assert await client.search("beef") is None


@pytest.mark.asyncio
async def test_search_no_api_key_returns_none(base_settings: Settings) -> None:
    settings = base_settings.model_copy(update={"BRAVE_API_KEY": None})
    client = BraveClient(settings)
    assert await client.search("beef") is None


@pytest.mark.asyncio
@respx.mock
async def test_search_budget_exhausted(base_settings: Settings) -> None:
    settings = base_settings.model_copy(update={"BRAVE_DAILY_BUDGET": 1})
    route = respx.get("https://api.search.brave.com/res/v1/web/search").mock(
        return_value=httpx.Response(
            200,
            json=_brave_response(
                [{"url": "https://fdc.nal.usda.gov/x", "title": "U", "description": "y"}]
            ),
        )
    )
    client = BraveClient(settings)
    first = await client.search("beef")
    assert first is not None
    second = await client.search("chicken")
    assert second is None
    # only one Brave call should have occurred
    assert route.call_count == 1


@pytest.mark.asyncio
@respx.mock
async def test_search_401_returns_none(base_settings: Settings) -> None:
    respx.get("https://api.search.brave.com/res/v1/web/search").mock(
        return_value=httpx.Response(401, text="bad key")
    )
    client = BraveClient(base_settings)
    assert await client.search("q") is None


@pytest.mark.asyncio
@respx.mock
async def test_search_network_error_returns_none(base_settings: Settings) -> None:
    respx.get("https://api.search.brave.com/res/v1/web/search").mock(
        side_effect=httpx.ConnectError("dns")
    )
    client = BraveClient(base_settings)
    assert await client.search("q") is None


@pytest.mark.asyncio
@respx.mock
async def test_search_invalid_json_returns_none(base_settings: Settings) -> None:
    respx.get("https://api.search.brave.com/res/v1/web/search").mock(
        return_value=httpx.Response(200, text="<html>not json</html>")
    )
    client = BraveClient(base_settings)
    assert await client.search("q") is None


@pytest.mark.asyncio
@respx.mock
async def test_search_subdomain_match(base_settings: Settings) -> None:
    """Subdomains of whitelisted hosts are accepted."""
    settings = base_settings.model_copy(update={"BRAVE_DOMAIN_WHITELIST": "example.com"})
    respx.get("https://api.search.brave.com/res/v1/web/search").mock(
        return_value=httpx.Response(
            200,
            json=_brave_response(
                [{"url": "https://sub.example.com/x", "title": "T", "description": "S"}]
            ),
        )
    )
    client = BraveClient(settings)
    result = await client.search("q")
    assert result is not None
    assert result.url == "https://sub.example.com/x"


def test_budget_resets_on_new_day() -> None:
    budget = BraveBudget()
    budget.record()
    assert budget.used_today == 1
    # Force new day
    budget._day = "2000-01-01"
    budget.reset_if_new_day()
    assert budget.used_today == 0
    today = datetime.now(UTC).strftime("%Y-%m-%d")
    assert budget._day == today
