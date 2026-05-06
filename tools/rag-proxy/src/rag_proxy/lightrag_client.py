"""Async LightRAG HTTP client. Failure modes (network/4xx/5xx/parse/timeout) collapse to None."""

from __future__ import annotations

import logging

import httpx

from rag_proxy.config import Settings
from rag_proxy.schemas import LightRagResponse

log = logging.getLogger(__name__)


class LightRagClient:
    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None) -> None:
        self._settings = settings
        self._client = client

    async def query(
        self,
        query: str,
        user_prompt: str,
    ) -> LightRagResponse | None:
        url = f"{self._settings.LIGHTRAG_BASE_URL.rstrip('/')}/query"
        headers: dict[str, str] = {"Content-Type": "application/json"}
        if self._settings.LIGHTRAG_API_KEY:
            headers["X-API-Key"] = self._settings.LIGHTRAG_API_KEY

        payload = {
            "query": query,
            "mode": self._settings.LIGHTRAG_MODE,
            "include_references": True,
            "include_chunk_content": True,
            "user_prompt": user_prompt,
        }

        client = self._client or httpx.AsyncClient(timeout=self._settings.LIGHTRAG_TIMEOUT_S)
        owns_client = self._client is None

        try:
            response = await client.post(url, headers=headers, json=payload)
        except httpx.RequestError as exc:
            log.warning("lightrag.request_error", extra={"error": str(exc)})
            return None
        finally:
            if owns_client:
                await client.aclose()

        if response.status_code != 200:
            log.warning(
                "lightrag.non_2xx",
                extra={"status": response.status_code, "body_preview": response.text[:200]},
            )
            return None

        try:
            body = response.json()
        except (ValueError, TypeError) as exc:
            log.warning("lightrag.parse_error", extra={"error": str(exc)})
            return None

        try:
            return LightRagResponse.model_validate(body)
        except Exception as exc:
            log.warning("lightrag.validation_error", extra={"error": str(exc)})
            return None

    async def healthcheck(self) -> bool:
        url = f"{self._settings.LIGHTRAG_BASE_URL.rstrip('/')}/health"
        headers: dict[str, str] = {}
        if self._settings.LIGHTRAG_API_KEY:
            headers["X-API-Key"] = self._settings.LIGHTRAG_API_KEY
        client = self._client or httpx.AsyncClient(timeout=5.0)
        owns_client = self._client is None
        try:
            response = await client.get(url, headers=headers)
            return response.status_code == 200
        except httpx.RequestError:
            return False
        finally:
            if owns_client:
                await client.aclose()
