"""USDA ingestion: CSV parsing + URL stamping + idempotency."""

from __future__ import annotations

import asyncio
import csv
from dataclasses import dataclass, field
from pathlib import Path

from rag_corpus.common import IngestTracker
from rag_corpus.ingest_usda import (
    build_chunk,
    fdc_url,
    ingest,
    summarise_nutrients,
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


def _write_food_csv(path: Path, rows: list[dict[str, str]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def _write_nutrient_csv(path: Path, rows: list[dict[str, str]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def test_fdc_url() -> None:
    assert fdc_url("173109") == "https://fdc.nal.usda.gov/fdc-app.html#/food-details/173109"


def test_build_chunk_minimal() -> None:
    food = {"description": "Beef, chuck", "fdc_id": "173109", "data_type": "sr_legacy_food"}
    chunk = build_chunk(food, "")
    assert "Beef, chuck" in chunk
    assert "173109" in chunk
    assert "sr_legacy_food" in chunk


def test_build_chunk_with_nutrients() -> None:
    food = {"description": "Beef", "fdc_id": "1", "data_type": "x"}
    summary = summarise_nutrients(
        [
            {"nutrient_id": "1003", "amount": "20.5"},
            {"nutrient_id": "1004", "amount": "15.0"},
        ]
    )
    chunk = build_chunk(food, summary)
    assert "Nutrients" in chunk
    assert "1003" in chunk


def test_summarise_truncates_at_25() -> None:
    rows = [{"nutrient_id": str(i), "amount": "1.0"} for i in range(50)]
    summary = summarise_nutrients(rows)
    lines = [ln for ln in summary.split("\n") if ln.strip()]
    assert len(lines) == 25


def test_ingest_inserts_each_food(tmp_path: Path) -> None:
    food_csv = tmp_path / "food.csv"
    _write_food_csv(
        food_csv,
        [
            {"fdc_id": "1", "description": "Apple", "data_type": "x", "food_category_id": "9", "publication_date": "2023-01-01"},
            {"fdc_id": "2", "description": "Banana", "data_type": "x", "food_category_id": "9", "publication_date": "2023-01-01"},
        ],
    )
    nutrient_csv = tmp_path / "food_nutrient.csv"
    _write_nutrient_csv(
        nutrient_csv,
        [
            {"fdc_id": "1", "nutrient_id": "1003", "amount": "0.5"},
            {"fdc_id": "2", "nutrient_id": "1003", "amount": "1.0"},
        ],
    )

    rag = FakeRag()
    tracker = IngestTracker(tmp_path)

    new, skip = asyncio.run(ingest(food_csv, nutrient_csv, rag, tracker))
    assert new == 2
    assert skip == 0
    assert len(rag.inserts) == 2
    # First insert payload should have the canonical FDC URL
    text, path = rag.inserts[0]
    assert "fdc-app.html#/food-details/1" in text
    assert path is not None and "fdc-app.html#/food-details/1" in path


def test_ingest_idempotent(tmp_path: Path) -> None:
    food_csv = tmp_path / "food.csv"
    _write_food_csv(
        food_csv,
        [{"fdc_id": "1", "description": "X", "data_type": "x", "food_category_id": "", "publication_date": ""}],
    )
    nutrient_csv = tmp_path / "food_nutrient.csv"  # absent intentionally
    rag = FakeRag()
    tracker = IngestTracker(tmp_path)

    asyncio.run(ingest(food_csv, nutrient_csv, rag, tracker))
    new, skip = asyncio.run(ingest(food_csv, nutrient_csv, rag, tracker))
    assert new == 0
    assert skip == 1
    assert len(rag.inserts) == 1  # only the first run inserted


def test_ingest_respects_limit(tmp_path: Path) -> None:
    food_csv = tmp_path / "food.csv"
    _write_food_csv(
        food_csv,
        [
            {"fdc_id": str(i), "description": f"F{i}", "data_type": "x", "food_category_id": "", "publication_date": ""}
            for i in range(10)
        ],
    )
    nutrient_csv = tmp_path / "food_nutrient.csv"
    rag = FakeRag()
    tracker = IngestTracker(tmp_path)

    new, _ = asyncio.run(ingest(food_csv, nutrient_csv, rag, tracker, limit=3))
    assert new == 3


def test_ingest_skips_rows_without_fdc_id(tmp_path: Path) -> None:
    food_csv = tmp_path / "food.csv"
    _write_food_csv(
        food_csv,
        [
            {"fdc_id": "", "description": "missing", "data_type": "x", "food_category_id": "", "publication_date": ""},
            {"fdc_id": "1", "description": "ok", "data_type": "x", "food_category_id": "", "publication_date": ""},
        ],
    )
    nutrient_csv = tmp_path / "food_nutrient.csv"
    rag = FakeRag()
    tracker = IngestTracker(tmp_path)

    new, _ = asyncio.run(ingest(food_csv, nutrient_csv, rag, tracker))
    assert new == 1
