"""Shared pytest fixtures."""

from __future__ import annotations

import pytest

from rag_proxy.config import Settings


@pytest.fixture()
def base_settings() -> Settings:
    return Settings(  # type: ignore[call-arg]
        LIGHTRAG_BASE_URL="http://lightrag.test:9621",
        LIGHTRAG_API_KEY="lightrag-test-key",
        LIGHTRAG_TIMEOUT_S=5.0,
        LIGHTRAG_MODE="hybrid",
        LIGHTRAG_SCORE_THRESHOLD=0.6,
        BRAVE_ENABLED=True,
        BRAVE_API_KEY="brave-test-key",
        BRAVE_TIMEOUT_S=5.0,
        BRAVE_DAILY_BUDGET=10,
        BRAVE_DOMAIN_WHITELIST="fdc.nal.usda.gov,eur-lex.europa.eu,en.wikipedia.org",
        RAG_PROXY_API_KEY="proxy-test-bearer",
    )
