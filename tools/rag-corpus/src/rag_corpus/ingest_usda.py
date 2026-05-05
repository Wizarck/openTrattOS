"""Ingest USDA FoodData Central (FDC) Foundation + SR Legacy datasets into LightRAG.

Source: https://fdc.nal.usda.gov/download-datasets
License: Public domain (US Government Work).

Each food item becomes one chunk: name + description + nutrient summary, tagged with
canonical FDC URL so the LLM can cite it via user_prompt schema.
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import logging
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

SOURCE_ID = "usda-fdc"
ERA = "modern"
DEFAULT_FOOD_CSV = "food.csv"
DEFAULT_NUTRIENT_CSV = "food_nutrient.csv"


def fdc_url(fdc_id: str) -> str:
    return f"https://fdc.nal.usda.gov/fdc-app.html#/food-details/{fdc_id}"


def build_chunk(food: dict[str, str], nutrient_summary: str) -> str:
    parts = [
        f"Food: {food.get('description', '').strip()}",
        f"FDC ID: {food.get('fdc_id', '').strip()}",
        f"Data type: {food.get('data_type', '').strip()}",
    ]
    cat = (food.get("food_category_id") or "").strip()
    if cat:
        parts.append(f"Category ID: {cat}")
    pub = (food.get("publication_date") or "").strip()
    if pub:
        parts.append(f"Publication date: {pub}")
    if nutrient_summary:
        parts.append(f"Nutrients (per 100g):\n{nutrient_summary}")
    return "\n".join(parts)


def summarise_nutrients(nutrients: list[dict[str, str]]) -> str:
    """Compact textual summary of a food's nutrient rows."""
    lines: list[str] = []
    for n in nutrients[:25]:  # truncate at 25 to keep chunk size sane
        amount = (n.get("amount") or "").strip()
        nid = (n.get("nutrient_id") or "").strip()
        if not amount or not nid:
            continue
        lines.append(f"  - nutrient={nid} amount={amount}")
    return "\n".join(lines)


def load_food_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def load_nutrients_grouped(path: Path) -> dict[str, list[dict[str, str]]]:
    grouped: dict[str, list[dict[str, str]]] = {}
    with path.open("r", encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            fdc_id = (row.get("fdc_id") or "").strip()
            if fdc_id:
                grouped.setdefault(fdc_id, []).append(row)
    return grouped


async def ingest(
    food_csv: Path,
    nutrient_csv: Path,
    rag: LightRagLike,
    tracker: IngestTracker,
    *,
    limit: int | None = None,
) -> tuple[int, int]:
    """Returns (newly_ingested, skipped)."""
    foods = load_food_csv(food_csv)
    nutrients = load_nutrients_grouped(nutrient_csv) if nutrient_csv.exists() else {}

    new = 0
    skip = 0
    for idx, food in enumerate(foods):
        if limit is not None and idx >= limit:
            break
        fdc_id = (food.get("fdc_id") or "").strip()
        if not fdc_id:
            continue
        url = fdc_url(fdc_id)
        nutrient_summary = summarise_nutrients(nutrients.get(fdc_id, []))
        chunk = build_chunk(food, nutrient_summary)
        was_new = await ingest_chunk(
            rag,
            tracker,
            content=chunk,
            source_url=url,
            era=ERA,
            source_id=SOURCE_ID,
        )
        if was_new:
            new += 1
        else:
            skip += 1
    return new, skip


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Ingest USDA FDC into LightRAG")
    parser.add_argument("--food-csv", type=Path, required=True, help="Path to food.csv")
    parser.add_argument(
        "--nutrient-csv",
        type=Path,
        default=None,
        help="Path to food_nutrient.csv (optional)",
    )
    parser.add_argument("--limit", type=int, default=None, help="Cap number of items")
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO)

    working_dir = get_working_dir()
    rag: Any = init_lightrag(working_dir)
    tracker = IngestTracker(working_dir)

    nutrient_csv = args.nutrient_csv or args.food_csv.parent / DEFAULT_NUTRIENT_CSV

    new, skip = asyncio.run(
        ingest(args.food_csv, nutrient_csv, rag, tracker, limit=args.limit)
    )
    log.info("usda.ingested", extra={"new": new, "skipped": skip})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
