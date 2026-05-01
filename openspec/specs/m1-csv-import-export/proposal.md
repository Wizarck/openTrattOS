# Proposal — m1-csv-import-export

## Why

The M1 implementation slice (`module-1-ingredients-implementation`, merged 2026-05-01) intentionally deferred CSV import/export to keep the foundation PR reviewable. CSV is operational, not architectural — M2 doesn't depend on it. But the PRD-M1 §5 NFR commits to "import 10k rows in <60s", and the M1 retro tagged this as the immediate follow-up.

This change adds streaming CSV import + export for `Ingredient` rows so onboarding restaurants can bulk-load their inventory catalogues from spreadsheet exports (the empirical channel: PRD §3 personas).

## What

Add two endpoints to `IngredientsController`:

- `POST /ingredients/import?dryRun={true|false}` — multipart upload, streams + validates a CSV in 500-row chunks per design.md §D10. Returns `{ valid, invalid, errors }`. On commit, transaction-per-chunk.
- `GET /ingredients/export.csv` — streams the org's ingredient list (same filters as `GET /ingredients`) as CSV. RFC 4180 quoting.

Plus the supporting services:

- `IngredientImportService` (parse + validate + persist in chunks)
- `IngredientExportService` (query + serialise)
- `csv-parse` + `csv-stringify` deps in `apps/api/package.json`
- A 10k-row sample fixture at `apps/api/test/fixtures/ingredients-sample.csv`

## Out of scope

- CSV import for entities other than `Ingredient` (Categories, Suppliers, etc.) — separate slices when needed.
- Background-job mode (long-running uploads via queue). M1.1 is synchronous; the 60s NFR comfortably fits a HTTP request.
- Format auto-detection (Excel `.xlsx`). CSV only.

## Dependencies

- M1 merged (`module-1-ingredients-implementation`) — provides `Ingredient`, `Category`, `IngredientRepository`, RBAC guards, audit interceptor.
- No upstream `ai-playbook` changes required.

## Cross-references

- PRD-M1 §5 NFR: "import 10k rows in <60s"
- design.md §D10 (CSV Import: streaming + transaction-per-batch)
- M1 retro `retros/module-1-ingredients-implementation.md` — §"What to change" item 1
