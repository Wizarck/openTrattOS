"""Escoffier ingestion: recipe-number split + Gutenberg URL stamping."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from pathlib import Path

from rag_corpus.common import IngestTracker
from rag_corpus.ingest_escoffier import (
    gutenberg_url,
    ingest,
    split_into_recipes,
)


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


def test_split_recipes() -> None:
    text = (
        "Some preamble.\n\n"
        "1234. Demi-glace\nA dark sauce.\n\n"
        "1235. Espagnole\nA mother sauce.\n\n"
        "1236. Velouté\nLight stock-based.\n"
    )
    sections = split_into_recipes(text)
    labels = [s[0] for s in sections]
    assert labels == ["recipe-1234", "recipe-1235", "recipe-1236"]


def test_split_recipes_no_marker_falls_back() -> None:
    text = "Just preamble with no numbered recipes."
    sections = split_into_recipes(text)
    assert sections == [("full", text)]


def test_gutenberg_url() -> None:
    assert gutenberg_url("12345", "recipe-1") == "https://www.gutenberg.org/ebooks/12345#recipe-1"


def test_ingest_calls_rag_per_recipe(tmp_path: Path) -> None:
    text = (
        "1234. Demi-glace\nA dark sauce.\n\n"
        "1235. Espagnole\nA mother sauce.\n"
    )
    text_path = tmp_path / "escoffier.txt"
    text_path.write_text(text, encoding="utf-8")

    rag = FakeRag()
    tracker = IngestTracker(tmp_path)
    new, skip = asyncio.run(ingest(text_path, "12345", rag, tracker))
    assert new == 2
    assert skip == 0

    text0, path0 = rag.inserts[0]
    assert "recipe-1234" in text0
    assert path0 == "https://www.gutenberg.org/ebooks/12345#recipe-1234"
    assert "era=historical" in text0
