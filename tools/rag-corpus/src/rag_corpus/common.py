"""Shared helpers for ingestion scripts: idempotent dedup + LightRAG client init."""

from __future__ import annotations

import hashlib
import json
import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

log = logging.getLogger(__name__)

INGESTED_LOG_NAME = ".ingested.jsonl"


class LightRagLike(Protocol):
    """Subset of LightRAG public API we depend on."""

    async def ainsert(
        self,
        input: str | list[str],
        ids: str | list[str] | None = ...,
        file_paths: str | list[str] | None = ...,
    ) -> None: ...


@dataclass(frozen=True, slots=True)
class IngestRecord:
    source_url: str
    content_hash: str
    era: str
    source_id: str

    def as_dict(self) -> dict[str, str]:
        return {
            "source_url": self.source_url,
            "content_hash": self.content_hash,
            "era": self.era,
            "source_id": self.source_id,
        }


class IngestTracker:
    """Tracks ingested records via append-only JSONL for idempotent re-runs."""

    def __init__(self, working_dir: Path) -> None:
        self._path = working_dir / INGESTED_LOG_NAME
        self._seen: set[str] = set()
        self._loaded = False

    def _load(self) -> None:
        if self._loaded:
            return
        self._loaded = True
        if not self._path.exists():
            return
        with self._path.open("r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    rec = json.loads(line)
                except json.JSONDecodeError:
                    continue
                h = rec.get("content_hash")
                if isinstance(h, str):
                    self._seen.add(h)

    def has(self, content_hash: str) -> bool:
        self._load()
        return content_hash in self._seen

    def mark(self, record: IngestRecord) -> None:
        self._load()
        if record.content_hash in self._seen:
            return
        self._seen.add(record.content_hash)
        self._path.parent.mkdir(parents=True, exist_ok=True)
        with self._path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(record.as_dict(), ensure_ascii=False) + "\n")


def hash_content(source_url: str, content: str) -> str:
    h = hashlib.sha256()
    h.update(source_url.encode("utf-8"))
    h.update(b"\x00")
    h.update(content.encode("utf-8"))
    return h.hexdigest()


def get_working_dir() -> Path:
    raw = os.environ.get("LIGHTRAG_WORKING_DIR")
    if not raw:
        raise RuntimeError(
            "LIGHTRAG_WORKING_DIR environment variable must be set "
            "(must match the LightRAG server's working_dir)."
        )
    path = Path(raw).expanduser().resolve()
    path.mkdir(parents=True, exist_ok=True)
    return path


async def ingest_chunk(
    rag: LightRagLike,
    tracker: IngestTracker,
    *,
    content: str,
    source_url: str,
    era: str,
    source_id: str,
) -> bool:
    """Insert a chunk into LightRAG if not already ingested.

    Returns True if newly ingested, False if skipped (already in tracker).
    """
    content_hash = hash_content(source_url, content)
    if tracker.has(content_hash):
        return False

    metadata_header = f"[source_url={source_url} era={era} source={source_id}]"
    payload = f"{metadata_header}\n{content}"

    await rag.ainsert(input=payload, file_paths=source_url)

    tracker.mark(
        IngestRecord(
            source_url=source_url,
            content_hash=content_hash,
            era=era,
            source_id=source_id,
        )
    )
    return True


def init_lightrag(working_dir: Path) -> Any:
    """Lazy import of LightRAG to keep dev/test installs lightweight."""
    try:
        from lightrag import LightRAG  # type: ignore[import-not-found]
        from lightrag.llm.ollama import ollama_embed  # type: ignore[import-not-found]
        from lightrag.llm.openai import openai_complete_if_cache  # type: ignore[import-not-found]
        from lightrag.utils import EmbeddingFunc  # type: ignore[import-not-found]
    except ImportError as exc:
        raise RuntimeError(
            "lightrag-hku is not installed. Install with `pip install -e \".[prod]\"`."
        ) from exc

    rag = LightRAG(
        working_dir=str(working_dir),
        llm_model_func=openai_complete_if_cache,
        embedding_func=EmbeddingFunc(
            embedding_dim=1024,
            max_token_size=8192,
            func=lambda texts: ollama_embed(texts, embed_model="bge-m3"),
        ),
    )
    return rag
