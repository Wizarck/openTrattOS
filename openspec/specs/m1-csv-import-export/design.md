## Context

CSV import/export for `Ingredient` rows. M1 merged with the entities + repos + REST surface in place; this change layers an import service + export service + 2 controller endpoints on top.

## Goals / Non-Goals

**Goals**: streaming validation in 500-row chunks (design.md §D10); transaction-per-chunk on commit (mid-import partial failure leaves prior chunks committed); dry-run preview returns `{ valid, invalid, errors }` without DB writes; 10k rows < 60s on the CI runner (PRD §5 NFR).

**Non-Goals**: bulk Category/Supplier import (later slices); background-job upload queue; Excel `.xlsx`; resuming a failed import partway.

## Decisions

### D1 — Streaming via `csv-parse` (not in-memory)

`csv-parse` is the de-facto Node CSV streaming parser; reads stdin as a Readable, yields each row through a Transform, never loads the whole file. 10k rows × ~200 bytes = 2MB; would fit in memory, but streaming makes the algorithm row-count-independent and the same code path handles edge-case 100k uploads gracefully.

### D2 — Chunking to 500 rows, transaction-per-chunk on commit

A 10k-row single-transaction lock blocks Postgres for >2s (D10 measured this). 500-row chunks amortise the lock; transaction-per-chunk semantics mean a poisoned row in chunk N+1 leaves chunks 1…N committed. The dry-run path skips the transaction entirely (validate-only).

The chunk size is configurable but defaults to 500 (compile-time constant). Tuning down to 100 helps if the CI runner is slow; tuning up doesn't help once network round-trip dominates over per-INSERT overhead.

### D3 — Validation: per-row, error-collecting

Each row is validated against a Zod-shaped schema (or class-validator on a transient DTO). Invalid rows do NOT abort the chunk — they accumulate in an `errors[]` array (with row index + column + message + value) and the valid rows continue. The response ships the full error list when `dryRun=true`; on commit, valid rows commit and invalid rows are returned in the same envelope.

Rationale: a 10k-row upload typically has 5-20 typo errors. Aborting the entire upload on the first error is brutal UX. Letting the worker decide ("commit valid 9985, fix the 15 manually" vs "fix the 15 first then re-run") is the right pattern.

### D4 — CSV column schema: pragmatic, not strict

Required columns: `name`, `categoryName` (resolved to categoryId via lookup), `baseUnitType`. Optional: `internalCode` (autogen if blank), `densityFactor`, `notes`.

The lookup `categoryName → categoryId` walks the org's category tree (case-insensitive on `name`). Ambiguous names (same name under different parents) are an error with `column: 'categoryName'` and a hint to use the slug path (e.g. `dry-pantry/oils-vinegars`).

### D5 — Export query path

`IngredientExportService.exportToStream(organizationId, filters)` reuses `IngredientRepository.pageByOrganization` internally to avoid loading 10k rows into memory. Walks the cursor pages, pipes each into the response stream via `csv-stringify`. Streamed gzip is out of scope for M1.1.

### D6 — RBAC

Both endpoints are MANAGER+ (Owner + Manager). STAFF can read individual ingredients but not bulk-export — bulk export is a privilege gate (export = data-leak vector).

### D7 — Internal-code uniqueness on import

Per-org `internalCode` is `UNIQUE` (constraint from M1's `0006_ingredient.ts`). Import collisions:
- If `internalCode` provided in CSV: row fails validation with `INGREDIENT_DUPLICATE_INTERNAL_CODE` if the code exists.
- If blank: autogen via the entity's `Ingredient.create()` factory; collision becomes vanishingly unlikely (slug + 6-char id suffix).

## Risks / Trade-offs

- Streaming + transaction-per-chunk means a single import isn't atomic. Documented in API description so callers don't assume "all-or-nothing".
- 60s NFR depends on CI runner spec. If a slow runner busts the budget, raise it in retro and tune chunk size.
- `csv-parse` quoting follows RFC 4180 by default but Excel's CSV is famously off-spec. Document any Excel-specific gotchas as they're reported.

## Migration Plan

No DB migration. No new entity. Pure additive on the API layer.

## Open Questions

None at proposal time. Remaining questions surface as the import service is built (chunk size tuning, error-format JSON shape) and get answered inline.
