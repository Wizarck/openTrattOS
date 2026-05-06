"""Environment-driven configuration for rag-proxy."""

from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_BRAVE_DOMAIN_WHITELIST = (
    "fdc.nal.usda.gov,"
    "eur-lex.europa.eu,"
    "efsa.europa.eu,"
    "fda.gov,"
    "who.int,"
    "fao.org,"
    "ciaa.es,"
    "en.wikipedia.org,"
    "es.wikipedia.org"
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    LIGHTRAG_BASE_URL: str
    LIGHTRAG_API_KEY: str | None = None
    LIGHTRAG_TIMEOUT_S: float = 30.0
    LIGHTRAG_MODE: str = "hybrid"
    LIGHTRAG_SCORE_THRESHOLD: float = Field(default=0.6, ge=0.0, le=1.0)

    BRAVE_ENABLED: bool = False
    BRAVE_API_KEY: str | None = None
    BRAVE_TIMEOUT_S: float = 10.0
    BRAVE_DAILY_BUDGET: int = Field(default=1000, ge=0)
    BRAVE_DOMAIN_WHITELIST: str = DEFAULT_BRAVE_DOMAIN_WHITELIST

    RAG_PROXY_API_KEY: str

    @property
    def brave_whitelist(self) -> list[str]:
        return [d.strip().lower() for d in self.BRAVE_DOMAIN_WHITELIST.split(",") if d.strip()]


def load_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
