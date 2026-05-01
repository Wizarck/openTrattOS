# Tasks — m1-csv-import-export

## 1. Dependencies + scaffolding

- [ ] 1.1 Add `csv-parse` + `csv-stringify` + `@types/multer` + `multer` to `apps/api/package.json` devDependencies/dependencies as appropriate; `npm install`
- [ ] 1.2 Wire NestJS multipart support: `app.use(multer().single('file'))` in `main.ts` (or `@nestjs/platform-express` `MulterModule`)

## 2. CSV column schema + row validator

- [ ] 2.1 Define `IngredientCsvRow` interface with required + optional columns
- [ ] 2.2 Write `IngredientRowValidator.validate(row, orgId, categoriesByName)` returning `{ ok: true, ingredient } | { ok: false, errors: [...] }`
- [ ] 2.3 Unit tests: required columns missing, unknown `baseUnitType`, density forbidden for UNIT, density non-positive, blank internalCode → autogen, slug-path category, ambiguous category, missing category

## 3. Streaming import service (D2 + D3)

- [ ] 3.1 Create `IngredientImportService` in `apps/api/src/ingredients/application/ingredient-import.service.ts`
- [ ] 3.2 Implement `parseAndValidate(stream, orgId, dryRun)` — uses `csv-parse` Transform; accumulates 500-row chunks; per-chunk validate via `IngredientRowValidator`
- [ ] 3.3 Implement `commitChunks(chunks, orgId)` — `dataSource.transaction(em => ...)` per chunk; chunk-level success collected; row-level errors propagate up
- [ ] 3.4 Result envelope: `{ valid: N, invalid: M, errors: [{ rowIndex, column, code, message, value? }] }`
- [ ] 3.5 Unit tests with in-memory streams covering: clean 10 rows, mixed 100 rows, 5 errors, mid-chunk DB CHECK rollback semantics

## 4. Streaming export service (D5)

- [ ] 4.1 Create `IngredientExportService` in `apps/api/src/ingredients/application/ingredient-export.service.ts`
- [ ] 4.2 Implement `exportToStream(organizationId, response)` — paginates `IngredientRepository.pageByOrganization` cursor-by-cursor; pipes through `csv-stringify`
- [ ] 4.3 Header row mirrors the import schema (round-trip safe)
- [ ] 4.4 Unit tests: small org (50 rows) → full output; bounded heap on synthetic 10k iteration

## 5. Controller endpoints (§D6 RBAC, §4 of release-management.md PR shape)

- [ ] 5.1 Add `POST /ingredients/import` to `IngredientsController` — `@UseInterceptors(FileInterceptor('file'))`, `@Roles('OWNER', 'MANAGER')`, query param `?dryRun={true|false}`
- [ ] 5.2 Add `GET /ingredients/export.csv` — sets `Content-Type` + `Content-Disposition` headers; pipes from `IngredientExportService`
- [ ] 5.3 Swagger annotations: `@ApiOperation`, multipart consumes, `@ApiQuery dryRun`
- [ ] 5.4 Error mapping: validation errors → 400 with `code: 'CSV_IMPORT_INVALID_FORMAT'`; size > 50MB → 413

## 6. Integration tests

- [ ] 6.1 INT spec: 10k-row fixture round-trip (import → query → export) takes <60s on CI runner (NFR gate)
- [ ] 6.2 INT spec: mid-chunk CHECK rollback — chunk 1 commits, chunk 2 with 1 bad row rolls back atomically; correct envelope returned
- [ ] 6.3 INT spec: dry-run does NOT touch the database (count before == count after)
- [ ] 6.4 Sample fixture at `apps/api/test/fixtures/ingredients-sample-1000.csv` (1k rows for quick smoke; CI generates the 10k variant lazily)

## 7. i18n + locale entries

- [ ] 7.1 Add `CSV_IMPORT_INVALID_FORMAT`, `CSV_IMPORT_TOO_LARGE`, `CATEGORY_AMBIGUOUS_NAME`, `INGREDIENT_DUPLICATE_INTERNAL_CODE_ON_IMPORT` keys to both `locales/{es,en}.json`
- [ ] 7.2 Run `npm run i18n:check` — 0 missing

## 8. Verification + PR

- [ ] 8.1 `openspec validate m1-csv-import-export` passes
- [ ] 8.2 `npx tsc --noEmit` clean; `npx eslint src` 0 errors / 0 warnings; `npx jest` all green; UoM coverage threshold still 100%
- [ ] 8.3 Run a manual smoke (Swagger UI): upload `ingredients-sample-1000.csv`, dry-run preview, then commit, then export back, diff = 0
- [ ] 8.4 Open PR `slice/m1-csv-import-export` → master per release-management.md §3.2
- [ ] 8.5 §4.5 self-review populated; CodeRabbit pass; Master Gate F approval; squash-merge
- [ ] 8.6 Retro at `retros/m1-csv-import-export.md`
