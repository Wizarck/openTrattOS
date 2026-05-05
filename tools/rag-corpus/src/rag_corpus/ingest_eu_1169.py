"""Ingest EU Reglamento (UE) Nº 1169/2011 (consolidated text) into LightRAG.

Source: https://eur-lex.europa.eu/legal-content/ES/TXT/?uri=CELEX:02011R1169-20180101
License: Decision 2011/833/EU — free reuse with attribution.

Splits the consolidated PDF by article + annex, citing each chunk back to the
canonical EUR-Lex URL with article anchor.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import re
from pathlib import Path
from typing import Any

from rag_corpus.common import (
    IngestTracker,
    LightRagLike,
    get_working_dir,
    ingest_chunk,
    init_lightrag,
)

log = logging.getLogger(__name__)

SOURCE_ID = "eur-lex-1169-2011"
ERA = "modern"
BASE_URL = "https://eur-lex.europa.eu/legal-content/ES/TXT/?uri=CELEX:02011R1169-20180101"

ARTICLE_PATTERN = re.compile(r"^(?:Artículo|ARTÍCULO|Article|ARTICLE)\s+(\d+)\b", re.MULTILINE)
ANNEX_PATTERN = re.compile(r"^(?:ANEXO|ANNEX)\s+([IVX]+)\b", re.MULTILINE)


def extract_pdf_text(pdf_path: Path) -> str:
    import pdfplumber  # local import: avoids requiring pdfplumber in lint-only CI

    chunks: list[str] = []
    with pdfplumber.open(str(pdf_path)) as doc:
        for page in doc.pages:
            text = page.extract_text() or ""
            chunks.append(text)
    return "\n".join(chunks)


def split_into_sections(text: str) -> list[tuple[str, str]]:
    """Returns [(section_label, content), ...] split by article + annex headings."""
    boundaries: list[tuple[int, str]] = []
    for m in ARTICLE_PATTERN.finditer(text):
        boundaries.append((m.start(), f"Art{m.group(1)}"))
    for m in ANNEX_PATTERN.finditer(text):
        boundaries.append((m.start(), f"Annex{m.group(1)}"))
    boundaries.sort()

    if not boundaries:
        return [("Full", text)]

    sections: list[tuple[str, str]] = []
    for i, (start, label) in enumerate(boundaries):
        end = boundaries[i + 1][0] if i + 1 < len(boundaries) else len(text)
        body = text[start:end].strip()
        if body:
            sections.append((label, body))
    return sections


def section_url(label: str) -> str:
    return f"{BASE_URL}#{label}"


async def ingest(
    pdf_path: Path,
    rag: LightRagLike,
    tracker: IngestTracker,
) -> tuple[int, int]:
    text = extract_pdf_text(pdf_path)
    sections = split_into_sections(text)

    new = 0
    skip = 0
    for label, body in sections:
        was_new = await ingest_chunk(
            rag,
            tracker,
            content=f"Reglamento (UE) Nº 1169/2011 — {label}\n\n{body}",
            source_url=section_url(label),
            era=ERA,
            source_id=SOURCE_ID,
        )
        if was_new:
            new += 1
        else:
            skip += 1
    return new, skip


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Ingest EU Reglamento 1169/2011 into LightRAG")
    parser.add_argument(
        "--pdf",
        type=Path,
        required=True,
        help="Path to consolidated PDF (download from EUR-Lex)",
    )
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO)

    working_dir = get_working_dir()
    rag: Any = init_lightrag(working_dir)
    tracker = IngestTracker(working_dir)

    new, skip = asyncio.run(ingest(args.pdf, rag, tracker))
    log.info("eu_1169.ingested", extra={"new": new, "skipped": skip})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
