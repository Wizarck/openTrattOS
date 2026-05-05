"""Ingest Escoffier *Le Guide Culinaire* (Project Gutenberg edition) into LightRAG.

Source: Project Gutenberg
License: Public domain (Escoffier d. 1935; first edition 1903; >100 years).

Project Gutenberg ebook IDs change over time; the script accepts a local
plain-text file the operator has already downloaded from gutenberg.org. The
ingested chunks are tagged `era=historical` so the user_prompt can prefer
modern sources for modern technique queries.
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

SOURCE_ID = "escoffier-gutenberg"
ERA = "historical"

CHAPTER_PATTERN = re.compile(r"^(?:CHAPTER|CHAPITRE|Chapter|Chapitre)\s+([IVX0-9]+)\b", re.MULTILINE)
RECIPE_PATTERN = re.compile(r"^\d{3,4}\.\s+", re.MULTILINE)


def split_into_recipes(text: str) -> list[tuple[str, str]]:
    """Split by recipe number markers (Escoffier numbers his entries)."""
    matches = list(RECIPE_PATTERN.finditer(text))
    if not matches:
        return [("full", text)]
    sections: list[tuple[str, str]] = []
    for i, m in enumerate(matches):
        start = m.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        body = text[start:end].strip()
        if not body:
            continue
        first_line = body.split("\n", 1)[0].strip()
        number_match = re.match(r"^(\d{3,4})\.", first_line)
        label = f"recipe-{number_match.group(1)}" if number_match else f"recipe-{i}"
        sections.append((label, body))
    return sections


def gutenberg_url(book_id: str, label: str) -> str:
    return f"https://www.gutenberg.org/ebooks/{book_id}#{label}"


async def ingest(
    text_path: Path,
    book_id: str,
    rag: LightRagLike,
    tracker: IngestTracker,
) -> tuple[int, int]:
    text = text_path.read_text(encoding="utf-8", errors="replace")
    sections = split_into_recipes(text)

    new = 0
    skip = 0
    for label, body in sections:
        was_new = await ingest_chunk(
            rag,
            tracker,
            content=f"Escoffier — Le Guide Culinaire — {label}\n\n{body}",
            source_url=gutenberg_url(book_id, label),
            era=ERA,
            source_id=SOURCE_ID,
        )
        if was_new:
            new += 1
        else:
            skip += 1
    return new, skip


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Ingest Escoffier Le Guide Culinaire (Project Gutenberg) into LightRAG"
    )
    parser.add_argument(
        "--text",
        type=Path,
        required=True,
        help="Plain-text file downloaded from Project Gutenberg",
    )
    parser.add_argument(
        "--book-id",
        type=str,
        required=True,
        help="Gutenberg ebook ID (numeric, e.g. 12345)",
    )
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO)

    working_dir = get_working_dir()
    rag: Any = init_lightrag(working_dir)
    tracker = IngestTracker(working_dir)

    new, skip = asyncio.run(ingest(args.text, args.book_id, rag, tracker))
    log.info("escoffier.ingested", extra={"new": new, "skipped": skip})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
