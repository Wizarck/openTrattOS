## ADDED Requirements

### Requirement: FIFO strategy consumes oldest-received lot first

The system SHALL implement a `resolveFifo(sortedLots, qtyNeeded): CostResolution` pure function that orders the input lots by `received_at` ascending and walks the queue from the oldest, consuming each lot in turn until `qtyNeeded` is satisfied or the queue is exhausted. Ties on `received_at` SHALL break on `id` lexicographic ascending for deterministic total ordering.

#### Scenario: Single oldest lot fully covers the request
- **WHEN** three lots exist with `received_at` 2026-05-01 (qty 10 @ €2.50), 2026-05-02 (qty 10 @ €3.00), 2026-05-03 (qty 10 @ €3.50) and the request is 5 units
- **THEN** the breakdown contains ONE entry pointing at the 2026-05-01 lot with `qty=5`, `subtotal=12.50`, and `remainingLots` shows that lot with `quantityRemaining=5`

#### Scenario: Walk multiple lots when the oldest is insufficient
- **WHEN** lots exist for 2026-05-01 (qty 3 @ €2.50) and 2026-05-02 (qty 10 @ €3.00) and the request is 5 units
- **THEN** the breakdown contains TWO entries: 2026-05-01 with `qty=3, subtotal=7.50` and 2026-05-02 with `qty=2, subtotal=6.00`; total `13.50`; `remainingLots` shows only the 2026-05-02 lot at `quantityRemaining=8`

#### Scenario: Tiebreaker on identical received_at sorts by id lexicographically
- **WHEN** two lots have identical `received_at='2026-05-01T10:00:00Z'` with ids `lot-aaa` and `lot-bbb`
- **THEN** the resolver consumes `lot-aaa` first

### Requirement: FEFO strategy consumes nearest-expiry lot first with NULLs LAST

The system SHALL implement a `resolveFefo(sortedLots, qtyNeeded): CostResolution` pure function that orders the input lots by `expires_at` ascending with `expires_at IS NULL` rows pushed to the END of the queue. Within the non-NULL group the secondary sort is `received_at` ascending; within the NULL group the secondary sort is also `received_at` ascending; tertiary sort in both groups is `id` lexicographic for total ordering.

#### Scenario: Lot expiring sooner is consumed first regardless of received_at
- **WHEN** two lots exist: `lot-A` received 2026-05-01 expiring 2026-06-15, and `lot-B` received 2026-05-03 expiring 2026-06-01, and the request is 5 units (each lot has qty 10)
- **THEN** the breakdown contains ONE entry pointing at `lot-B` (earlier expiry) with `qty=5`

#### Scenario: NULL expires_at sorts after all dated lots
- **WHEN** two lots exist: `lot-A` with `expires_at=NULL` (shelf-stable salt) and `lot-B` with `expires_at=2026-06-15`, request 5 units
- **THEN** `lot-B` is consumed first; `lot-A` (NULL) is consumed ONLY if `lot-B` is exhausted

#### Scenario: NULL-vs-NULL tiebreaker uses received_at then id
- **WHEN** three lots have `expires_at=NULL` with `received_at` of 2026-05-01, 2026-05-02, 2026-05-03
- **THEN** consumption order is 2026-05-01, then 2026-05-02, then 2026-05-03

#### Scenario: Same expires_at tiebreaker uses received_at
- **WHEN** two lots share `expires_at='2026-06-01'` with `received_at` 2026-05-01 and 2026-05-03
- **THEN** the 2026-05-01 lot is consumed first

### Requirement: Resolver walks multiple lots when single lot insufficient

The system SHALL traverse the sorted lot queue when a single lot's `quantityRemaining` is less than the requested quantity. The walk SHALL stop when (a) the running consumed quantity equals the requested quantity, or (b) the queue is exhausted. Each consumed lot SHALL contribute one entry to the `CostBreakdownLine[]` with `qty = min(lot.quantityRemaining, remainingNeeded)`.

#### Scenario: Three-lot walk produces three breakdown entries
- **WHEN** four lots exist (qty 2, 3, 4, 10 in FIFO order) and the request is 8 units
- **THEN** the breakdown contains 3 entries: lot 1 (qty=2), lot 2 (qty=3), lot 3 (qty=3); lot 4 is untouched and present in `remainingLots`

#### Scenario: Walk stops exactly at qty_needed
- **WHEN** the cumulative quantity from N lots exactly equals `qty_needed` and the (N+1)-th lot still has remaining quantity
- **THEN** the walk stops after N lots and the (N+1)-th lot appears UNMODIFIED in `remainingLots`

### Requirement: Resolver throws InsufficientInventoryError on global shortage

The system SHALL throw `InsufficientInventoryError` when the sum of `quantityRemaining` across ALL input lots is strictly less than `qtyNeeded`. The error SHALL carry `organizationId`, `productId`, `quantityRequested`, `quantityAvailable`, and `quantityShortfall` fields readable by callers. The resolver SHALL NOT return a partial `CostResolution` in this case.

#### Scenario: Empty lot queue raises shortage error
- **WHEN** an empty array `[]` is passed with `qtyNeeded=5`
- **THEN** `InsufficientInventoryError` is thrown with `quantityAvailable=0`, `quantityShortfall=5`

#### Scenario: Total available below request raises shortage error
- **WHEN** lots sum to qty 7 and the request is 10
- **THEN** `InsufficientInventoryError` is thrown with `quantityShortfall=3`; no partial breakdown is returned

#### Scenario: Error includes context for operator UX
- **WHEN** the error is caught by the caller
- **THEN** `error.organizationId`, `error.productId`, `error.quantityShortfall` are accessible and the `error.message` mentions all three

### Requirement: Resolver is a pure function with no side effects

The system SHALL guarantee that `resolveFifo`, `resolveFefo`, and `InventoryCostResolverServiceM3.resolveCost` perform NO database writes, NO event emissions, and NO audit-log appends. Given the same input snapshot of lots + the same strategy + the same `qty_needed`, the resolver SHALL return bit-for-bit identical `CostResolution` output on every invocation.

#### Scenario: Identical input produces identical output across N calls
- **WHEN** `resolveCost(input)` is called 100 times with the same input
- **THEN** every returned `CostResolution` is deeply equal (totalCost, breakdown, remainingLots, strategy, currency)

#### Scenario: No DB INSERT/UPDATE/DELETE during resolution
- **WHEN** the resolver runs against a Postgres test container with INSERT/UPDATE/DELETE auditing enabled on `lots`, `stock_moves`, `audit_log`, `cost_snapshots`
- **THEN** the audit reports ZERO write events triggered by the resolver call (only the SELECT on `lots` is recorded)

#### Scenario: No domain events emitted during resolution
- **WHEN** an `EventEmitter2` spy is installed during a `resolveCost` call
- **THEN** the spy records zero `emit*` invocations from any cost-resolver code path

### Requirement: Multi-tenant isolation via organizationId-first parameter

The system SHALL accept `organizationId` as the first parameter of `InventoryCostResolverServiceM3.resolveCost(input)`. The repository call to `LotRepository.findAvailableFifo` SHALL include `organizationId` in the WHERE clause. No public method SHALL accept input without `organizationId`, and the TypeScript signature SHALL enforce this at compile time.

#### Scenario: Cross-tenant fixture leakage test passes
- **WHEN** the INT test suite seeds orgA and orgB with overlapping product / lot data and calls `resolveCost(orgA, ...)` for a productId that exists in both
- **THEN** the resolution uses ONLY orgA's lots; orgB lots are absent from the breakdown

#### Scenario: Missing organizationId fails TypeScript build
- **WHEN** a developer attempts to call `resolveCost({ productId, ... })` without `organizationId` (compile-time check)
- **THEN** the TypeScript compilation fails with a missing-required-field error; the build does not produce a passing artifact

### Requirement: Per-product strategy attribute is honoured

The system SHALL read `products.cost_resolution_strategy` (`'FIFO' | 'FEFO' | 'MANUAL'`) from the database. When the product strategy is `'FIFO'` or `'FEFO'` (and no org override applies), the resolver SHALL dispatch to `resolveFifo` or `resolveFefo` respectively. When the strategy is `'MANUAL'`, the resolver SHALL fall back to the M2 `PreferredSupplierResolver` path for that product.

#### Scenario: Per-product FIFO strategy dispatches to FIFO
- **WHEN** `products.cost_resolution_strategy='FIFO'` and the org has no override
- **THEN** `resolveCost.strategy='FIFO'` and the breakdown matches the FIFO algorithm output

#### Scenario: Per-product FEFO strategy dispatches to FEFO
- **WHEN** `products.cost_resolution_strategy='FEFO'` and the org has no override
- **THEN** `resolveCost.strategy='FEFO'` and the breakdown matches the FEFO algorithm output

#### Scenario: Per-product MANUAL falls back to M2 supplier-list-price path
- **WHEN** `products.cost_resolution_strategy='MANUAL'`
- **THEN** the resolver delegates to `PreferredSupplierResolver.resolveBaseCost` and returns a single-line breakdown with `lotId=null`, `subtotal=quantity × supplierUnitPrice`

### Requirement: Organization policy override supersedes per-product strategy

The system SHALL read `organizations.cost_resolution_policy_override` (`'FIFO' | 'FEFO' | NULL`). When the column is non-NULL, the strategy selector SHALL return the org-policy value regardless of the per-product attribute. When the column is NULL, the strategy selector SHALL fall back to the per-product attribute. The `'MANUAL'` value SHALL NOT be valid for the org-policy override.

#### Scenario: Org override forces FEFO across all products
- **WHEN** `organizations.cost_resolution_policy_override='FEFO'` and a product has `cost_resolution_strategy='FIFO'`
- **THEN** `selectStrategy` returns `'FEFO'`; `resolveCost.strategy='FEFO'`

#### Scenario: NULL org override falls back to per-product default
- **WHEN** `organizations.cost_resolution_policy_override=NULL` and a product has `cost_resolution_strategy='FIFO'`
- **THEN** `selectStrategy` returns `'FIFO'`

#### Scenario: Database-level CHECK rejects MANUAL as org-policy value
- **WHEN** SQL attempts to UPDATE `organizations.cost_resolution_policy_override='MANUAL'`
- **THEN** the database raises a CHECK-constraint violation; the row is not updated

#### Scenario: Test override bypass via strategyOverride input
- **WHEN** `resolveCost` is called with `strategyOverride='FEFO'` (test-fixture lever)
- **THEN** `selectStrategy` is bypassed; `resolveCost.strategy='FEFO'` regardless of product / org settings

### Requirement: Property-based CSV fixture asserts algorithmic invariants

The system SHALL ship `apps/api/src/inventory/cost/__fixtures__/fifo-fefo-cases.csv` with at least 50 rows covering FIFO basics, FEFO basics, partial consumption, multi-lot walks, NULL `expires_at` edge cases, error cases, and unit-cost progression. The Jest test harness SHALL parse the CSV via `csv-parse/sync` and assert the resolver output against `expected_total_cost`, `expected_breakdown_json`, `expected_remaining_lots_json`, and `expected_error` for every row. The test SHALL print `case_id` on failure for surgical diagnosis.

#### Scenario: Harness exercises every CSV row
- **WHEN** `npm test -w apps/api -- cost.service.property.spec` runs
- **THEN** the test suite reports at least 50 passing assertions, one per CSV row

#### Scenario: Failure message identifies the CSV case_id
- **WHEN** a fabricated bug breaks the FEFO sort (NULL expires_at no longer sorts last)
- **THEN** the test failure message contains `case_id=fefo-null-001` (or similar) directing the developer at the exact CSV row to repro

#### Scenario: New bug + CSV row are added in same PR
- **WHEN** a production incident reveals a missing edge case
- **THEN** the fix PR contains BOTH the algorithm patch AND a new row in `fifo-fefo-cases.csv` exercising the case; CI fails if the new row alone is missing per the lint rule "fix without test"

### Requirement: Performance — 100k lots × 10k queries under 5s p99

The system SHALL satisfy NFR-PERF: across an organization with 100,000 active lots (`quantity_remaining > 0`), 10,000 sequential `resolveCost` calls SHALL complete in under 5 seconds at p99 wall-clock. The performance test SHALL run against the vps-postgres test instance per [[reference_vps_postgres_test]] when Docker Desktop is unavailable.

#### Scenario: Property test runs under target latency
- **WHEN** `cost.service.perf.spec.ts` seeds 100k lots distributed across 1000 products and executes 10k random `resolveCost` calls
- **THEN** the p99 wall-clock duration is < 5s; the test fails (red) above this threshold

#### Scenario: Index idx_lots_org_loc_available_fifo is used (EXPLAIN)
- **WHEN** the test runs `EXPLAIN (FORMAT JSON) SELECT ... FROM lots WHERE organization_id=$1 AND location_id=$2 AND quantity_remaining > 0 ORDER BY received_at ASC`
- **THEN** the query plan shows `Index Scan using idx_lots_org_loc_available_fifo`; sequential scan does NOT appear

#### Scenario: Per-call median latency is sub-millisecond
- **WHEN** the perf test reports per-call latency distribution
- **THEN** the median is < 1ms (target proven against the slice-#1 index)

### Requirement: M2 InventoryCostResolver interface remains backward-compatible

The system SHALL preserve the M2 `InventoryCostResolver.resolveBaseCost(ingredientId, options?)` method signature on the new M3 service so existing M2 callers (`CostService.computeRecipeCost`, `RecipesCostController`) work unchanged. The M3 implementation SHALL project the multi-lot `CostResolution` down to the M2 `ResolvedCost` shape (single `costPerBaseUnit`, currency, source).

#### Scenario: M2 caller receives ResolvedCost shape unchanged
- **WHEN** `CostService.computeRecipeCost` calls `resolver.resolveBaseCost(ingredientId, { sourceOverrideRef: null })` against the M3 service
- **THEN** the response shape matches the M2 `ResolvedCost` interface (costPerBaseUnit, currency, source); no M2 caller code change is needed

#### Scenario: M2 resolveBaseCost computes from a 1-unit M3 resolution
- **WHEN** `resolveBaseCost(ingredientId)` runs against an M3 lot snapshot
- **THEN** the returned `costPerBaseUnit` equals the unit cost of the FIFO/FEFO-elected lot (for a 1-unit consumption), and the `source` field references the chosen `lotId`

#### Scenario: M2 fallback path runs when M3_COST_RESOLVER_ENABLED=false
- **WHEN** the env flag `M3_COST_RESOLVER_ENABLED=false` is set at module init
- **THEN** the DI binding for `INVENTORY_COST_RESOLVER` resolves to `PreferredSupplierResolver` (M2 path); the M3 service is never invoked
