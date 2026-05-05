"""EU 1169/2011: section split + URL anchoring + idempotency."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from pathlib import Path

import pytest

from rag_corpus.common import IngestTracker
from rag_corpus.ingest_eu_1169 import (
    BASE_URL,
    section_url,
    split_into_sections,
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


def test_split_into_sections_articles() -> None:
    text = (
        "Algun preámbulo.\n\n"
        "Artículo 1\nObjeto y ámbito de aplicación.\n\n"
        "Artículo 2\nDefiniciones.\n\n"
        "Artículo 3\nObjetivos generales.\n"
    )
    sections = split_into_sections(text)
    labels = [s[0] for s in sections]
    assert labels == ["Art1", "Art2", "Art3"]


def test_split_into_sections_with_annex() -> None:
    text = (
        "Artículo 1\nIntro.\n\n"
        "ANEXO II\nLista de sustancias o productos.\n\n"
    )
    sections = split_into_sections(text)
    labels = [s[0] for s in sections]
    assert "Art1" in labels
    assert "AnnexII" in labels


def test_split_into_sections_no_match_falls_back() -> None:
    text = "Just some preamble without article markers."
    sections = split_into_sections(text)
    assert sections == [("Full", text)]


def test_section_url() -> None:
    assert section_url("Art21") == f"{BASE_URL}#Art21"


def test_ingest_calls_rag_per_section(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Mock pdfplumber by monkeypatching extract_pdf_text."""
    from rag_corpus import ingest_eu_1169

    text = (
        "Artículo 9\nIndicaciones obligatorias.\n\n"
        "Artículo 21\nIndicación de los alérgenos.\n\n"
    )
    monkeypatch.setattr(ingest_eu_1169, "extract_pdf_text", lambda p: text)

    rag = FakeRag()
    tracker = IngestTracker(tmp_path)
    fake_pdf = tmp_path / "fake.pdf"
    fake_pdf.write_bytes(b"")  # not actually opened

    new, skip = asyncio.run(ingest_eu_1169.ingest(fake_pdf, rag, tracker))
    assert new == 2
    assert skip == 0
    assert len(rag.inserts) == 2

    text0, path0 = rag.inserts[0]
    assert "Art9" in text0
    assert path0 == f"{BASE_URL}#Art9"


def test_ingest_idempotent(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from rag_corpus import ingest_eu_1169

    text = "Artículo 1\nfoo.\n"
    monkeypatch.setattr(ingest_eu_1169, "extract_pdf_text", lambda p: text)

    rag = FakeRag()
    tracker = IngestTracker(tmp_path)
    fake_pdf = tmp_path / "fake.pdf"
    fake_pdf.write_bytes(b"")

    asyncio.run(ingest_eu_1169.ingest(fake_pdf, rag, tracker))
    new, skip = asyncio.run(ingest_eu_1169.ingest(fake_pdf, rag, tracker))
    assert new == 0
    assert skip == 1
