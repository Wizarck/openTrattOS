#!/usr/bin/env bash
# Run all corpus ingestion scripts in dependency order.
# Idempotent: re-runs skip already-ingested chunks.
# CIAA is gated by CIAA_PERMISSION_GRANTED=true.

set -euo pipefail

if [[ -z "${LIGHTRAG_WORKING_DIR:-}" ]]; then
  echo "LIGHTRAG_WORKING_DIR must be set" >&2
  exit 1
fi

CORPUS_DIR="${CORPUS_DIR:-./corpus}"
mkdir -p "$CORPUS_DIR"

echo "==> USDA FoodData Central"
if [[ -f "$CORPUS_DIR/food.csv" ]]; then
  python -m rag_corpus.ingest_usda --food-csv "$CORPUS_DIR/food.csv"
else
  echo "  (skipping — $CORPUS_DIR/food.csv not present)"
fi

echo "==> EU Reglamento 1169/2011"
if [[ -f "$CORPUS_DIR/eu-1169-2011.pdf" ]]; then
  python -m rag_corpus.ingest_eu_1169 --pdf "$CORPUS_DIR/eu-1169-2011.pdf"
else
  echo "  (skipping — $CORPUS_DIR/eu-1169-2011.pdf not present)"
fi

echo "==> Escoffier (Project Gutenberg)"
if [[ -f "$CORPUS_DIR/escoffier.txt" && -n "${ESCOFFIER_BOOK_ID:-}" ]]; then
  python -m rag_corpus.ingest_escoffier \
    --text "$CORPUS_DIR/escoffier.txt" \
    --book-id "$ESCOFFIER_BOOK_ID"
else
  echo "  (skipping — escoffier.txt or ESCOFFIER_BOOK_ID not set)"
fi

echo "==> CIAA Spain (gated)"
python -m rag_corpus.ingest_ciaa

echo "Corpus run complete."
