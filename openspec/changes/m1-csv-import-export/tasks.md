# Tasks — m1-csv-import-export

## 1. Dependencies + scaffolding

- [x] 1.1 Add `csv-parse` + `csv-stringify` + `@types/multer` + `multer` to `apps/api/package.json`; `npm install`
- [x] 1.2 NestJS multipart via `FileInterceptor` from `@nestjs/platform-express` (per-route, no global wiring needed)

## 2. CSV column schema + row validator

- [x] 2.1 `IngredientCsvRow` interface + `REQUIRED_COLUMNS` / `OPTIONAL_COLUMNS` constants
- [x] 2.2 `IngredientRowValidator.validate(row, rowIndex)` returning `{ ok: true, ingredient } | { ok: false, errors }`
- [x] 2.3 Unit tests: 20 cases covering required-column gaps, unknown baseUnitType, density rules, internalCode autogen, slug-path resolution, ambiguous category, missing category, multi-error accumulation

## 3. Streaming import service (D2 + D3)

- [x] 3.1 `IngredientImportService` at `apps/api/src/ingredients/application/ingredient-import.service.ts`
- [x] 3.2 `parseAndCommit(stream, options)` — `csv-parse` columns callback throws `CsvImportFormatError` on missing required headers; per-row validate via `IngredientRowValidator`
- [x] 3.3 `flushChunk(...)` — `dataSource.transaction(em => repo.save(chunk))`; rollback marks every row in the chunk with `code: 'CSV_IMPORT_CHUNK_ROLLED_BACK'`
- [x] 3.4 Result envelope `{ valid, invalid, errors }`
- [x] 3.5 Unit tests: 7 cases covering header validation, dry-run bypass, mixed-validity reporting, chunk-size respect, mid-chunk rollback semantics, all-invalid skip

## 4. Streaming export service (D5)

- [x] 4.1 `IngredientExportService` at `apps/api/src/ingredients/application/ingredient-export.service.ts`
- [x] 4.2 `exportToStream(dest, options)` — cursor-paginates via `IngredientRepository.pageByOrganization`; pipes through `csv-stringify`
- [x] 4.3 Header row matches `EXPORT_HEADER` (round-trip safe with the import schema)
- [x] 4.4 Unit tests: 5 cases covering small org, multi-page pagination, slug-path emission, null densityFactor → empty cell, empty org → header-only output

## 5. Controller endpoints

- [x] 5.1 `POST /ingredients/import` — `@UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50MB } }))`, `@Roles('OWNER', 'MANAGER')`, `?dryRun=true|false`
- [x] 5.2 `GET /ingredients/export.csv` — `Content-Type: text/csv` + `Content-Disposition` with `ingredients-<org>-<YYYY-MM-DD>.csv`
- [x] 5.3 Swagger: `@ApiOperation`, `@ApiConsumes('multipart/form-data')`, `@ApiBody` with binary file schema
- [x] 5.4 Error mapping: `CsvImportFormatError` → 400 `code: 'CSV_IMPORT_INVALID_FORMAT'`; missing file → 400 `detail: 'no file uploaded'`

## 6. Integration tests

- [x] 6.1 INT NFR gate: 10k rows commit in <60s (Jest timeout 90s for safety)
- [x] 6.2 INT chunked rollback: chunk 1 commits, chunk 2 rolls back atomically (via duplicate `internalCode`), chunk 3 commits
- [x] 6.3 INT dry-run: count before == count after
- [ ] 6.4 1000-row sample fixture — DEFERRED to Gate F smoke step; INT specs already cover the same code paths

## 7. i18n + locale entries

- [x] 7.1 Add 5 new keys to both locales (`CSV_IMPORT_CHUNK_ROLLED_BACK`, `CATEGORY_AMBIGUOUS_NAME`, `INGREDIENT_NAME_REQUIRED`, `INGREDIENT_INVALID_BASE_UNIT_TYPE`, `INGREDIENT_FACTORY_REJECTED`)
- [x] 7.2 `npm run i18n:check` — 53 keys parity OK

## 8. Verification + PR

- [x] 8.1 `openspec validate m1-csv-import-export` passes
- [x] 8.2 tsc clean; eslint 0 errors / 0 warnings; 282 unit tests green; UoM 100% coverage threshold preserved
- [ ] 8.3 Manual smoke via Swagger UI — DEFERRED to post-merge (needs docker + running API)
- [x] 8.4 Open PR `slice/m1-csv-import-export` → master
- [ ] 8.5 §4.5 self-review populated; CodeRabbit pass; Master Gate F approval; squash-merge — pending
- [ ] 8.6 Retro at `retros/m1-csv-import-export.md` — pending
