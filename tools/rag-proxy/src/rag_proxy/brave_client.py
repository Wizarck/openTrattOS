"""Async Brave Search client with daily budget + domain whitelist filtering."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from urllib.parse import urlparse

import httpx

from rag_proxy.config import Settings
from rag_proxy.schemas import BraveResult

log = logging.getLogger(__name__)

BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search"


class BraveBudget:
    """In-memory UTC-day query counter. Resets at midnight UTC."""

    def __init__(self) -> None:
        self._day: str = self._today()
        self._count: int = 0

    @staticmethod
    def _today() -> str:
        return datetime.now(UTC).strftime("%Y-%m-%d")

    def reset_if_new_day(self) -> None:
        today = self._today()
        if today != self._day:
            self._day = today
            self._count = 0

    def can_spend(self, daily_budget: int) -> bool:
        self.reset_if_new_day()
        return self._count < daily_budget

    def record(self) -> None:
        self.reset_if_new_day()
        self._count += 1

    @property
    def used_today(self) -> int:
        self.reset_if_new_day()
        return self._count


class BraveClient:
    def __init__(
        self,
        settings: Settings,
        client: httpx.AsyncClient | None = None,
        budget: BraveBudget | None = None,
    ) -> None:
        self._settings = settings
        self._client = client
        self._budget = budget or BraveBudget()

    @property
    def budget(self) -> BraveBudget:
        return self._budget

    async def search(self, query: str) -> BraveResult | None:
        if not self._settings.BRAVE_ENABLED:
            return None
        if not self._settings.BRAVE_API_KEY:
            log.warning("brave.disabled.no_api_key")
            return None
        if not self._budget.can_spend(self._settings.BRAVE_DAILY_BUDGET):
            log.warning("brave.budget_exceeded", extra={"used": self._budget.used_today})
            return None

        headers = {
            "Accept": "application/json",
            "X-Subscription-Token": self._settings.BRAVE_API_KEY,
        }
        params = {"q": query, "count": 10}

        client = self._client or httpx.AsyncClient(timeout=self._settings.BRAVE_TIMEOUT_S)
        owns_client = self._client is None

        try:
            response = await client.get(BRAVE_SEARCH_URL, headers=headers, params=params)
        except httpx.RequestError as exc:
            log.warning("brave.request_error", extra={"error": str(exc)})
            return None
        finally:
            if owns_client:
                await client.aclose()

        # Spend the budget regardless of the result, since the API call was made.
        self._budget.record()

        if response.status_code != 200:
            log.warning(
                "brave.non_2xx",
                extra={"status": response.status_code, "body_preview": response.text[:200]},
            )
            return None

        try:
            data = response.json()
        except (ValueError, TypeError) as exc:
            log.warning("brave.parse_error", extra={"error": str(exc)})
            return None

        results = data.get("web", {}).get("results", [])
        if not isinstance(results, list):
            return None

        whitelist = self._settings.brave_whitelist
        for raw in results:
            url = raw.get("url")
            title = raw.get("title", "")
            description = raw.get("description", "")
            if not url or not isinstance(url, str):
                continue
            if not _hostname_matches_whitelist(url, whitelist):
                continue
            return BraveResult(url=url, title=title, snippet=description)

        return None


def _hostname_matches_whitelist(url: str, whitelist: list[str]) -> bool:
    try:
        host = (urlparse(url).hostname or "").lower()
    except ValueError:
        return False
    if not host:
        return False
    for allowed in whitelist:
        allowed = allowed.lower().lstrip("*").lstrip(".")
        if host == allowed or host.endswith("." + allowed):
            return True
    return False
