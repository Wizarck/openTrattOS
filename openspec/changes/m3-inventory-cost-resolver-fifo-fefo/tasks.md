## 1. Migrations — strategy columns

- [ ] 1.1 `apps/api/src/migrations/0028_add_cost_resolution_strategy_to_products.ts` — add `cost_resolution_strategy text NOT NULL DEFAULT 'FIFO' CHECK (cost_resolution_strategy IN ('FIFO','FEFO','MANUAL'))` to `products` table
- [ ] 1.2 Down migration drops the column
- [ ] 1.3 `apps/api/src/migrations/0029_add_cost_resolution_policy_to_orgs.ts` — add `cost_resolution_policy_override text NULL CHECK (cost_resolution_policy_override IS NULL OR cost_resolution_policy_override IN ('FIFO','FEFO'))` to `organizations` table
- [ ] 1.4 Down migration drops the column

## 2. Domain types + Zod schemas

- [ ] 2.1 `apps/api/src/inventory/cost/domain/types.ts` — inline types per [[feedback_subagent_apply_typing_fix_cascade]]:
  - `Strategy = 'FIFO' | 'FEFO' | 'MANUAL'`
  - `LotCostRow { id, organizationId, locationId, productId, receivedAt, expiresAt, quantityRemaining, unitCostAtReceived, currency }`
  - `CostBreakdownLine { lotId, qty, unitCost, subtotal, receivedAt, expiresAt }`
  - `CostResolution { totalCost, currency, strategy, breakdown, remainingLots, asOfTime }`
  - `ResolveCostInput { organizationId, locationId, productId, quantity, asOfTime, strategyOverride? }`
- [ ] 2.2 Same file: Zod schemas matching every type. Use `.min(1)` (NOT `.nonempty()`) per Wave 2.1 lessons. Export both type + schema with companion `.parse()` helpers.
- [ ] 2.3 `apps/api/src/inventory/cost/domain/strategy.ts` — `Strategy` enum + `isStrategy(value): value is Strategy` type-guard

## 3. Domain errors

- [ ] 3.1 `apps/api/src/inventory/cost/domain/errors.ts`:
  - `InsufficientInventoryError` — carries `organizationId`, `productId`, `quantityRequested`, `quantityAvailable`, `quantityShortfall`
  - `UnknownStrategyError` — thrown when DB returns a value not in `Strategy` enum (defensive against future schema drift)
  - `StrategyMismatchError` — thrown when org override is `'MANUAL'` (DB CHECK should prevent this; defence-in-depth)
- [ ] 3.2 Each error sets `name` to the class name (for `instanceof` checks in callers and clean JSON serialization)

## 4. FIFO pure resolver

- [ ] 4.1 `apps/api/src/inventory/cost/application/fifo.resolver.ts` — pure function `resolveFifo(rows: LotCostRow[], qtyNeeded: number, currency: string, asOfTime: Date): CostResolution`
- [ ] 4.2 Sort by `received_at` ASC; tiebreak by `id` lexicographic ASC for total ordering
- [ ] 4.3 Walk queue with `min(lot.quantityRemaining, remainingNeeded)` per ADR-COST-PARTIAL-LOT-CONSUMPTION
- [ ] 4.4 Round every subtotal to 4 decimal places via shared `round4()` helper (matches M2 ROLLUP_TOLERANCE)
- [ ] 4.5 Throw `InsufficientInventoryError` when queue exhausted with `needed > 0`
- [ ] 4.6 Unit tests covering: single lot exact, single lot partial, multi-lot walk, zero-qty request, exhausted lot at front, identical received_at tiebreaker

## 5. FEFO pure resolver

- [ ] 5.1 `apps/api/src/inventory/cost/application/fefo.resolver.ts` — pure function `resolveFefo(rows, qtyNeeded, currency, asOfTime): CostResolution`
- [ ] 5.2 Sort with NULL `expires_at` pushed LAST per ADR-COST-FEFO-NULLS:
  - both null → tiebreak by `received_at` ASC then `id`
  - one null → null lot sorts after
  - neither null → compare `expires_at` ASC; tiebreak by `received_at` ASC then `id`
- [ ] 5.3 Reuse the walk helper from FIFO resolver (share via `application/_walk-queue.ts`)
- [ ] 5.4 Unit tests covering: earlier-expiry-preferred, NULL-LAST behaviour, NULL-vs-NULL tiebreaker, same-expires tiebreaker on received_at, mixed NULL + dated lots

## 6. Strategy selector

- [ ] 6.1 `apps/api/src/inventory/cost/application/strategy-selector.ts` — pure function `selectStrategy(productStrategy: Strategy, orgOverride: Strategy | null): Strategy`
- [ ] 6.2 Rule: `orgOverride ?? productStrategy`
- [ ] 6.3 Defensive `UnknownStrategyError` when input not in the enum (post-DB-fetch validation)
- [ ] 6.4 Unit tests covering all 9 combinations (FIFO/FEFO/MANUAL product × null/FIFO/FEFO org override)

## 7. CostResolverService — NestJS DI-injectable wrapper

- [ ] 7.1 `apps/api/src/inventory/cost/application/inventory-cost-resolver.service.ts`:
  - `@Injectable()` class `InventoryCostResolverServiceM3 implements InventoryCostResolver`
  - Constructor injects `LotRepository`, `DataSource` (for product + org reads), `PreferredSupplierResolver` (for MANUAL fallback)
  - Method `resolveCost(input: ResolveCostInput): Promise<CostResolution>`:
    1. Fetch product `cost_resolution_strategy` + org `cost_resolution_policy_override` (single SQL JOIN)
    2. Call `selectStrategy()`
    3. If `MANUAL` → delegate to `PreferredSupplierResolver.resolveBaseCost`, project to single-line `CostResolution`
    4. Else fetch lot snapshot via `LotRepository.findAvailableFifo(organizationId, locationId, productId, asOfTime)`
    5. Dispatch to `resolveFifo` or `resolveFefo`
  - Method `resolveBaseCost(ingredientId, options?)` — M2-compatible projection:
    1. Build `ResolveCostInput` with `quantity=1`
    2. Call `resolveCost(input)`
    3. Map to M2 `ResolvedCost { costPerBaseUnit, currency, source: { kind: 'batch', refId: lotId, displayLabel } }`
    4. Catch `InsufficientInventoryError` → throw M2 `NoCostSourceError(ingredientId, "insufficient inventory")`
- [ ] 7.2 No DB writes; no event emit. Guarded by ESLint custom rule that flags `eventEmitter.emit` or `repository.save` / `update` / `delete` calls in this file

## 8. CostModule wiring + DI feature flag

- [ ] 8.1 Update `apps/api/src/cost/cost.module.ts`:
  - Add `InventoryCostResolverServiceM3` to providers
  - Replace fixed `useExisting: PreferredSupplierResolver` with `useFactory` per ADR-COST-DI-FEATURE-FLAG (reads `process.env.M3_COST_RESOLVER_ENABLED`)
  - Import `InventoryModule` (slice #1 `m3-lot-aggregate`) to access `LotRepository`
- [ ] 8.2 `apps/api/src/cost/cost.module.spec.ts` — unit test asserting:
  - Flag `'true'` (default) → binding resolves to M3 service
  - Flag `'false'` → binding resolves to M2 `PreferredSupplierResolver`
  - Flag absent → binding resolves to M3 service (default-on)

## 9. Property-based CSV fixture

- [ ] 9.1 `apps/api/src/inventory/cost/__fixtures__/fifo-fefo-cases.csv` — author at least 50 rows covering:
  - FIFO basic (single lot exact, single lot partial): 5 cases
  - FIFO multi-lot walks: 8 cases
  - FIFO with identical received_at (tiebreaker): 5 cases
  - FEFO basic: 5 cases
  - FEFO with NULL `expires_at`: 5 cases
  - FEFO same-expires tiebreakers: 5 cases
  - Edge: exhausted lot at front, zero-qty request: 7 cases
  - Error: empty queue, global shortage, qty=0: 5 cases
  - Mixed unit-cost progression (price ↗ and ↘): 5 cases
- [ ] 9.2 CSV schema: `case_id, strategy, lots_json, qty_requested, expected_total_cost, expected_breakdown_json, expected_remaining_lots_json, expected_error`
- [ ] 9.3 Lint rule in `apps/api/eslint-rules/no-fix-without-csv-row.ts` — fails if `application/fifo.resolver.ts` or `application/fefo.resolver.ts` is changed without a CSV row diff in the same commit

## 10. Property-based test harness

- [ ] 10.1 `apps/api/src/inventory/cost/application/cost.service.property.spec.ts`:
  - Import `csv-parse/sync` (CJS interop per [[feedback_subagent_apply_typing_fix_cascade]] — `import { parse } from 'csv-parse/sync'`)
  - Read `__fixtures__/fifo-fefo-cases.csv` at suite startup
  - Loop over rows; for each: build LotCostRow[] from lots_json, call FIFO or FEFO resolver, assert breakdown / total / remaining lots / error
  - On failure, include `case_id` in the assertion message (printed to console)
- [ ] 10.2 Confirm `csv-parse` is in `apps/api/package.json` devDependencies (add if missing)

## 11. Unit + INT tests

- [ ] 11.1 `apps/api/src/inventory/cost/application/fifo.resolver.spec.ts` — ~12 unit tests
- [ ] 11.2 `apps/api/src/inventory/cost/application/fefo.resolver.spec.ts` — ~12 unit tests
- [ ] 11.3 `apps/api/src/inventory/cost/application/strategy-selector.spec.ts` — 9 combination tests + 1 invalid-input test
- [ ] 11.4 `apps/api/src/inventory/cost/application/inventory-cost-resolver.service.spec.ts` — unit tests with mocked `LotRepository`, mocked `DataSource`, mocked `PreferredSupplierResolver`
- [ ] 11.5 `apps/api/src/inventory/cost/application/inventory-cost-resolver.service.int.spec.ts` — INT test against real Postgres (vps-postgres fallback per [[reference_vps_postgres_test]]):
  - Seeds 2 orgs with overlapping productIds; asserts cross-tenant isolation
  - Seeds product with `cost_resolution_strategy='FIFO'`, lots with mixed received_at, asserts FIFO breakdown
  - Sets org `cost_resolution_policy_override='FEFO'`, asserts FEFO dispatch
  - Asserts ZERO writes to `audit_log` / `lots` / `stock_moves` during resolveCost (write-spy via TypeORM subscriber)

## 12. Performance test against vps-postgres

- [ ] 12.1 `apps/api/src/inventory/cost/application/cost.service.perf.spec.ts`:
  - Seeds 100k lots across 1000 products in one org (one-time setup, ~30s)
  - Runs 10k random `resolveCost` calls; measures p50, p95, p99
  - Asserts p99 < 5000ms per NFR-PERF
  - Uses `process.env.PERF_TEST_DB_URL` for vps-postgres test instance; skipped (not failed) when env var missing so default `npm test` doesn't hit the VPS
- [ ] 12.2 EXPLAIN assertion: query plan uses `idx_lots_org_loc_available_fifo`; sequential scan absent
- [ ] 12.3 Document the perf-test invocation in `apps/api/README.md` (add 1-paragraph "Running perf tests" section pointing at the env var + the vps-postgres reference)

## 13. Docs + ADR cross-references

- [ ] 13.1 `docs/architecture/adrs/ADR-COST-STRATEGY-PER-PRODUCT.md` — promote from design.md (canonical location, links back here)
- [ ] 13.2 `docs/architecture/adrs/ADR-COST-RESOLVER-INTERFACE.md` — same
- [ ] 13.3 `docs/architecture/adrs/ADR-COST-FEFO-NULLS.md` — same
- [ ] 13.4 `docs/architecture/adrs/ADR-COST-INSUFFICIENT-INVENTORY.md` — same
- [ ] 13.5 Update `docs/architecture/INDEX.md` with the four new ADR entries
- [ ] 13.6 Update `apps/api/src/cost/inventory-cost-resolver.ts` doc-comment to reference the M3 service swap + feature-flag mechanism (1-paragraph addition)
