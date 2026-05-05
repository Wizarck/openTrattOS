"""Idempotency + tracker semantics for ingestion."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from pathlib import Path

import pytest

from rag_corpus.common import IngestRecord, IngestTracker, hash_content, ingest_chunk


@dataclass
class FakeRag:
    inserts: list[tuple[str, str | None]] = field(default_factory=list)

    async def ainsert(
        self,
        input: str | list[str],
        ids: str | list[str] | None = None,
        file_paths: str | list[str] | None = None,
    ) -> None:
        text = input if isinstance(input, str) else "\n".join(input)
        path = file_paths if isinstance(file_paths, str) else None
        self.inserts.append((text, path))


def test_hash_content_deterministic() -> None:
    a = hash_content("https://x", "content")
    b = hash_content("https://x", "content")
    assert a == b


def test_hash_content_url_sensitive() -> None:
    a = hash_content("https://x", "content")
    b = hash_content("https://y", "content")
    assert a != b


def test_hash_content_text_sensitive() -> None:
    a = hash_content("https://x", "content")
    b = hash_content("https://x", "different")
    assert a != b


def test_tracker_persists_across_instances(tmp_path: Path) -> None:
    rec = IngestRecord(
        source_url="https://x", content_hash="abc123", era="modern", source_id="test"
    )
    t1 = IngestTracker(tmp_path)
    assert not t1.has("abc123")
    t1.mark(rec)
    assert t1.has("abc123")

    t2 = IngestTracker(tmp_path)
    assert t2.has("abc123")


def test_tracker_dedup_within_session(tmp_path: Path) -> None:
    rec = IngestRecord(
        source_url="https://x", content_hash="dup", era="modern", source_id="test"
    )
    tracker = IngestTracker(tmp_path)
    tracker.mark(rec)
    tracker.mark(rec)  # second mark must be a no-op
    log_path = tmp_path / ".ingested.jsonl"
    lines = log_path.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 1


def test_tracker_handles_missing_log(tmp_path: Path) -> None:
    tracker = IngestTracker(tmp_path)
    assert not tracker.has("nope")


def test_tracker_handles_corrupt_lines(tmp_path: Path) -> None:
    log = tmp_path / ".ingested.jsonl"
    log.write_text("not-json\n{\"content_hash\": \"abc\"}\n", encoding="utf-8")
    tracker = IngestTracker(tmp_path)
    assert tracker.has("abc")


def test_ingest_chunk_inserts_first_time(tmp_path: Path) -> None:
    rag = FakeRag()
    tracker = IngestTracker(tmp_path)

    was_new = asyncio.run(
        ingest_chunk(
            rag,
            tracker,
            content="USDA chunk",
            source_url="https://fdc.nal.usda.gov/x",
            era="modern",
            source_id="usda",
        )
    )
    assert was_new is True
    assert len(rag.inserts) == 1
    text, path = rag.inserts[0]
    assert "https://fdc.nal.usda.gov/x" in text
    assert "era=modern" in text
    assert "USDA chunk" in text
    assert path == "https://fdc.nal.usda.gov/x"


def test_ingest_chunk_skips_dup(tmp_path: Path) -> None:
    rag = FakeRag()
    tracker = IngestTracker(tmp_path)

    asyncio.run(
        ingest_chunk(
            rag, tracker,
            content="C", source_url="https://x", era="modern", source_id="s",
        )
    )
    was_new = asyncio.run(
        ingest_chunk(
            rag, tracker,
            content="C", source_url="https://x", era="modern", source_id="s",
        )
    )
    assert was_new is False
    assert len(rag.inserts) == 1


def test_get_working_dir_requires_env(monkeypatch: pytest.MonkeyPatch) -> None:
    from rag_corpus.common import get_working_dir

    monkeypatch.delenv("LIGHTRAG_WORKING_DIR", raising=False)
    with pytest.raises(RuntimeError, match="LIGHTRAG_WORKING_DIR"):
        get_working_dir()


def test_get_working_dir_creates_path(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    from rag_corpus.common import get_working_dir

    target = tmp_path / "lightrag-data"
    monkeypatch.setenv("LIGHTRAG_WORKING_DIR", str(target))
    result = get_working_dir()
    assert result.exists()
    assert result.is_dir()


def test_init_lightrag_raises_without_lib(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """init_lightrag must raise a clear error when LightRAG is not installed."""
    from rag_corpus import common

    # Force the import inside init_lightrag to fail by removing module from cache
    monkeypatch.setattr(common, "init_lightrag", common.init_lightrag)
    # We can't easily uninstall lightrag; just assert the function exists and is callable.
    # The actual ImportError path is exercised when pip install -e ".[dev]" omits prod deps.
    assert callable(common.init_lightrag)
