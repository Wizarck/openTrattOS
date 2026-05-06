"""Pydantic schemas for the rag-proxy public API and internal LightRAG/Brave shapes."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class QueryRequest(BaseModel):
    kind: Literal["yield", "waste"]
    query: str = Field(min_length=1)
    context: dict[str, Any] = Field(default_factory=dict)


class QueryResponse(BaseModel):
    value: float
    citation_url: str = Field(alias="citationUrl")
    snippet: str

    model_config = {"populate_by_name": True}


class HealthResponse(BaseModel):
    status: str
    lightrag: bool
    brave: bool


class LightRagReference(BaseModel):
    reference_id: str | None = None
    file_path: str | None = None
    content: list[str] | None = None


class LightRagResponse(BaseModel):
    response: str
    references: list[LightRagReference] = Field(default_factory=list)


class BraveResult(BaseModel):
    url: str
    title: str
    snippet: str
