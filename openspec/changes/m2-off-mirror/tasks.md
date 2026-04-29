## 1. Schema + entity

- [ ] 1.1 Create migration for `external_food_catalog` table: `id`, `barcode` (unique), `name`, `brand`, `nutrition` (jsonb), `allergens` (text[]), `dietFlags` (text[]), `region`, `lastModifiedAt`, `licenseAttribution`, `syncedAt`
- [ ] 1.2 Add indexes: `(barcode)` unique, `(region, lastModifiedAt)`, `(name) gin trgm` for fuzzy search
- [ ] 1.3 Create TypeORM entity `apps/api/src/external-catalog/entities/external-food-catalog.entity.ts`

## 2. Sync worker

- [ ] 2.1 Implement `OffSyncService` with cursor-based incremental pull from OFF REST API
- [ ] 2.2 Region scoping by org country (initial regions: ES + IT for Palafito + Italian customers)
- [ ] 2.3 Upsert by `barcode`; advance cursor on success; persist `licenseAttribution` from OFF response
- [ ] 2.4 Wire as a NestJS scheduled task (`@Cron`) with weekly cadence (Sunday 02:00 UTC)
- [ ] 2.5 Initial-sync hook: run once on M2 deploy if `external_food_catalog` is empty

## 3. Search service

- [ ] 3.1 Implement `ExternalCatalogService.searchByBarcode(barcode)` — local first, fall through to OFF API
- [ ] 3.2 Implement `searchByName(query, region)` — fuzzy trigram against local mirror
- [ ] 3.3 Implement `searchByBrand(brand, region)` — exact + prefix match against local mirror
- [ ] 3.4 Cache-miss fallback: persist OFF API hit as a new row before returning
- [ ] 3.5 Outage degradation: catch fetch errors, log warning, return "not found"

## 4. Endpoints

- [ ] 4.1 `GET /health/external-catalog` — public health-check returning `{lastSyncAt, rowCount, stale}`
- [ ] 4.2 `POST /external-catalog/sync` — Owner+ guard, triggers immediate sync, returns 202 with job id
- [ ] 4.3 RBAC guard: `OwnerOnlyGuard` rejects Manager and Staff with 403

## 5. Tests

- [ ] 5.1 Initial-sync round-trip: deploy migration, run sync, verify ~200k rows for ES region
- [ ] 5.2 Cursor advances correctly across consecutive runs
- [ ] 5.3 Cache-hit path: search by known barcode returns <50ms with no network call (mock OFF API)
- [ ] 5.4 Cache-miss + persist: unknown barcode falls through, persists, returns; second call hits cache
- [ ] 5.5 OFF outage: API mocked to 503; cache-miss query returns "not found" with warning log
- [ ] 5.6 Admin force-refresh: Owner POST returns 202; Manager POST returns 403
- [ ] 5.7 Health endpoint: stale flag set when `lastSyncAt > 14d`

## 6. Operational

- [ ] 6.1 Document weekly cron schedule + manual force-refresh runbook in `docs/runbooks/off-sync.md`
- [ ] 6.2 Add monitoring alert: `external_food_catalog stale=true` for >24h
- [ ] 6.3 Verify ODbL attribution renders on at least one consumer (`#5` ingredient picker) post-merge

## 7. Verification

- [ ] 7.1 Run `openspec validate m2-off-mirror` — must pass
