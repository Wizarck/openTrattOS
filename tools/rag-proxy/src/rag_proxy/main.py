"""FastAPI application orchestrating LightRAG + Brave fallback + iron rule."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException, status

from rag_proxy.brave_client import BraveClient
from rag_proxy.config import Settings, load_settings
from rag_proxy.extractor import (
    VALUE_FROM_SNIPPET_PROMPT,
    build_user_prompt,
    extract_json,
)
from rag_proxy.iron_rule import apply_iron_rule
from rag_proxy.lightrag_client import LightRagClient
from rag_proxy.schemas import (
    BraveResult,
    HealthResponse,
    QueryRequest,
    QueryResponse,
)

log = logging.getLogger(__name__)


def create_app(
    settings: Settings | None = None,
    lightrag_client: LightRagClient | None = None,
    brave_client: BraveClient | None = None,
) -> FastAPI:
    settings = settings or load_settings()
    lightrag = lightrag_client or LightRagClient(settings)
    brave = brave_client or BraveClient(settings)
    app = FastAPI(title="rag-proxy", version="0.1.0")
    app.state.settings = settings
    app.state.lightrag = lightrag
    app.state.brave = brave

    def require_bearer(authorization: str | None = Header(default=None)) -> None:
        expected = f"Bearer {settings.RAG_PROXY_API_KEY}"
        if not authorization or authorization != expected:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)

    @app.get("/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        lightrag_ok = await lightrag.healthcheck()
        return HealthResponse(
            status="ok",
            lightrag=lightrag_ok,
            brave=settings.BRAVE_ENABLED and bool(settings.BRAVE_API_KEY),
        )

    @app.post("/query", response_model=QueryResponse | None)
    async def query(
        body: QueryRequest,
        _: None = Depends(require_bearer),
    ) -> QueryResponse | None:
        return await _orchestrate(body, lightrag=lightrag, brave=brave)

    return app


async def _orchestrate(
    body: QueryRequest,
    *,
    lightrag: LightRagClient,
    brave: BraveClient,
) -> QueryResponse | None:
    user_prompt = build_user_prompt(body.kind)
    candidate = await _try_lightrag(body.query, user_prompt, lightrag)
    if candidate is not None:
        return candidate

    log.info("orchestrate.lightrag_miss", extra={"kind": body.kind})

    brave_result = await brave.search(body.query)
    if brave_result is None:
        return None

    return await _try_brave_extract(brave_result, body.kind, lightrag)


async def _try_lightrag(
    query: str,
    user_prompt: str,
    lightrag: LightRagClient,
) -> QueryResponse | None:
    response = await lightrag.query(query, user_prompt)
    if response is None:
        return None
    parsed = extract_json(response.response)
    if parsed is None:
        retry_prompt = (
            user_prompt
            + " IMPORTANT: your previous response could not be parsed as JSON. "
            "Output JSON ONLY, with no surrounding text."
        )
        response = await lightrag.query(query, retry_prompt)
        if response is None:
            return None
        parsed = extract_json(response.response)
        if parsed is None:
            return None
    return _parsed_to_response(parsed)


def _parsed_to_response(parsed: dict[str, Any]) -> QueryResponse | None:
    value = parsed.get("value")
    citation_url = parsed.get("citationUrl") or parsed.get("citation_url")
    snippet = parsed.get("snippet")
    return apply_iron_rule(value, citation_url, snippet)


async def _try_brave_extract(
    brave_result: BraveResult,
    kind: str,
    lightrag: LightRagClient,
) -> QueryResponse | None:
    extract_prompt = VALUE_FROM_SNIPPET_PROMPT.format(kind=kind, snippet=brave_result.snippet)
    response = await lightrag.query(brave_result.snippet, extract_prompt)
    if response is None:
        return None
    parsed = extract_json(response.response)
    if parsed is None:
        return None
    value = parsed.get("value")
    return apply_iron_rule(value, brave_result.url, brave_result.snippet)


