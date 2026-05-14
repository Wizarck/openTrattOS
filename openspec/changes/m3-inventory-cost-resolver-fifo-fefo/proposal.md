## Why

M2 left the `InventoryCostResolver` interface in place as the architectural seam between supplier-list-price costing (M2 default) and batch-aware costing (M3 closure). Architecture-m3.md §Implementation Sequence (line 295) names slice #4 as the second-priority operational slice: **"`InventoryCostResolver` FIFO/FEFO impl (`apps/api/src/inventory/cost-resolver/`): closes M2 seam."** PRD-m3 FR7 makes the requirement concrete:

> **FR7**: System can compute FIFO/FEFO cost via the `InventoryCostResolver` interface, returning actual batch cost (not approximate supplier list price) for any cost rollup.

M3 is also the moment to ship the **per-lot cost resolution algorithm** that the rest of the operational track depends on:

| Slice | Depends on this slice |
|---|---|
| `m3-cost-snapshot-persistence` (#5) | persists the breakdown returned by this resolver to `audit_log` |
| `m3-gr-aggregate-reconciliation` (#7) | unit price stamped on `Lot` becomes the cost source the resolver walks |
| `m3-recall-86-flag-dispatch` (#13) | dossier section "which lots priced which dishes" reads the resolver breakdown |
| `m3-cost-by-tag-dashboard` (#20) | aggregates per-recipe cost rollups that ultimately walk this resolver |

PRD-m3 §Strategic context line 84 frames the business stakes:

> The same `InventoryCostResolver` interface M2 deliberately planted now returns FIFO/FEFO batch cost — oldest batches consume first, matching the HACCP physical flow used by McDonald's, Sodexo, Aramark. Cost rolls up from actual purchase invoices, not approximate supplier list prices. Margin numbers become real.

This slice ships the **algorithm only** — pure compute over a snapshot of available lots. Snapshot persistence (writing the chosen breakdown to `audit_log` + emitting `COST_SNAPSHOT_RECORDED`) is slice #5. Until this lands, every cost rollup in M3 reverts to the M2 `PreferredSupplierResolver` (approximate list price); FR7 stays unsatisfied; recall dossiers and APPCC exports cannot answer "which lot priced this dish".

**Murat / property-based testing.** A bare unit-test grid cannot exhaust the combinatorial state space of (input lots state × strategy × consumption qty). Per [[reference_eligia_dashboard_ai_obs]] and feedback retrospective on arithmetic regressions, the resolver SHALL ship with a CSV-driven property fixture (~50 cases) that the test harness loops over. Each row pins (strategy, lots_json, qty_requested, expected_total_cost, expected_breakdown_json). New algorithm changes are caught at PR review by the harness re-running every row.

## What Changes

- **New BC `apps/api/src/inventory/cost/`** (per architecture-m3.md §BC inventory line 484: "`Lot`, `StockMove`, `lot.controller.ts`, `inventory-cost-resolver.service.ts`, FIFO/FEFO logic"). Layout:
  - `domain/types.ts` — inline types: `LotCostRow`, `CostBreakdownLine`, `CostResolution`, `Strategy` enum, `ResolveCostInput`. Zod schemas alongside. Per [[feedback_subagent_apply_typing_fix_cascade]], inline; no extraction to `packages/contracts/`.
  - `domain/errors.ts` — `InsufficientInventoryError`, `UnknownStrategyError`, `StrategyMismatchError`.
  - `application/fifo.resolver.ts` — pure function `resolveFifo(rows, qtyNeeded): CostResolution`. Sorts by `received_at` ASC, walks the queue, partial-lot logic via `min(remaining, needed)`.
  - `application/fefo.resolver.ts` — pure function `resolveFefo(rows, qtyNeeded): CostResolution`. Sorts by `expires_at` ASC NULLS LAST, then `received_at` ASC, then `id` for total ordering.
  - `application/strategy-selector.ts` — pure function `selectStrategy(product, orgPolicy): Strategy`. Org policy override > product default.
  - `application/inventory-cost-resolver.service.ts` — NestJS DI-injectable wrapper. Calls `LotRepository.findAvailableFifo(organizationId, locationId, ingredientId, asOf)` from slice #1 (`m3-lot-aggregate`, merged) to fetch the snapshot, picks the strategy, delegates to the pure resolver. **NO mutations**, **NO event emit**, **NO audit write** — slice #5 owns persistence.
  - `interface/` — no controllers in this slice (the resolver is consumed by M2 `CostService` via DI, not over HTTP).
  - `cost.module.ts` — NestJS module wiring; rebinds `INVENTORY_COST_RESOLVER` token to `InventoryCostResolverServiceM3` (M3) while keeping `PreferredSupplierResolver` (M2) available behind a feature flag for fallback during M3 rollout.
  - `__fixtures__/fifo-fefo-cases.csv` — 50+ property-test rows.
- **Migration 0028 — add `cost_resolution_strategy` column to `products` table**. Default `'FIFO'`. Used by `strategy-selector.ts` (ADR-COST-STRATEGY-PER-PRODUCT).
- **Migration 0029 — add `cost_resolution_policy_override` column to `organizations` table**. NULLABLE. NULL means "use per-product default". Used by `strategy-selector.ts` for cross-cutting org policy.
- **NO BREAKING CHANGES.** M2 `InventoryCostResolver` interface (`apps/api/src/cost/inventory-cost-resolver.ts`) stays untouched. M3 introduces a new DI binding behind the same token. M2 `CostService.computeRecipeCost()` call sites are unchanged.
- **NO UX.** PRD-m3 slice list line 63 confirms: "no UX (M2 interface unchanged)".

## Capabilities

### New Capabilities

- `inventory-cost-resolver`: FIFO/FEFO cost resolution against `Lot` rows. Pure compute (no DB writes, no events) returning `CostResolution` with totals + per-lot breakdown. Strategy chosen per-product with org-level policy override. Property-based CSV fixture covers 50+ edge cases (empty lots, exhausted lots, NULL expiries, partial consumption, global shortage).

### Modified Capabilities

- None. M2 `CostModule` rebinds the `INVENTORY_COST_RESOLVER` DI token to the M3 service; M2 callers (`CostService.computeRecipeCost`, `RecipesCostController`) keep working without code changes.

## Impact

- **Prerequisites**: slice #1 (`m3-lot-aggregate`, merged in 0dab33b) ships `Lot` entity + `LotRepository.findAvailableFifo()`. Without it, the resolver cannot fetch its snapshot. No other prerequisites.
- **Code**:
  - `apps/api/src/inventory/cost/` (new BC: domain + application + module). ~750 LOC.
  - `apps/api/src/migrations/0028_add_cost_resolution_strategy_to_products.ts` + `0029_add_cost_resolution_policy_to_orgs.ts`. ~80 LOC combined.
  - `apps/api/src/inventory/cost/__fixtures__/fifo-fefo-cases.csv`. ~50 rows × ~6 cols.
  - Tests: ~35 new tests (unit + INT + property-CSV runner).
- **Performance**:
  - Per-resolution: O(n log n) for sort (small n — typical org has < 200 active lots per ingredient at any one time) + O(k) walk where k = number of lots consumed (typically 1–3 per recipe line). Sub-millisecond per call against the slice-#1 index `idx_lots_org_loc_available_fifo`.
  - NFR-PERF target: 100k lots × 10k consumption queries < 5s p99 wall-clock. Validated by `cost.service.perf.spec.ts` against the vps-postgres test instance per [[reference_vps_postgres_test]].
- **Storage growth**: zero new tables. Two new columns on existing tables (`products.cost_resolution_strategy text DEFAULT 'FIFO'`, `organizations.cost_resolution_policy_override text NULL`) — ~16 bytes/row × ~10k rows = trivial.
- **Audit**: this slice is **pure compute**. No audit emission. Slice #5 (`m3-cost-snapshot-persistence`) wires `COST_SNAPSHOT_RECORDED` to the audit subscriber. Per ADR-COST-NO-AUDIT-EMIT-HERE: keeping the resolver pure is a deliberate testability invariant — the same fixture row + strategy MUST produce the same breakdown bit-for-bit, run after run, with no side effects.
- **Rollback**: drop migrations 0028 + 0029 (column drops) and revert the `INVENTORY_COST_RESOLVER` DI binding in `CostModule` to `PreferredSupplierResolver`. M2 behaviour resumes. No data loss — M2 supplier-list-price path is the canonical fallback during M3 rollout.
- **Strategy default**: `FIFO` for all existing products. Per ADR-COST-STRATEGY-PER-PRODUCT, FEFO is opt-in via the column (perishable categories — produce, dairy, meat — will be tagged in slice #7 `m3-gr-aggregate-reconciliation` based on supplier metadata; not in scope here).
- **Out of scope** (claimed by other slices, do not pre-empt):
  - Snapshot persistence + `COST_SNAPSHOT_RECORDED` audit event emission → `m3-cost-snapshot-persistence` (slice #5).
  - Lot creation + `received_at` + `unit_price` stamping on `Lot` → `m3-gr-aggregate-reconciliation` (slice #7).
  - Stock-move decrement (`quantity_remaining` mutation) → `m3-lot-consumption-events` (slice #2).
  - Cost-by-tag dashboard widget → `m3-cost-by-tag-dashboard` (slice #20).
  - UX surface for strategy override (per-product or per-org). M2 interface unchanged; org admins set strategy via direct DB UPDATE in MVP. Optional admin screen deferred to M3.x.
- **Parallelism**: this slice depends on slice #1 (merged) only. It writes exclusively to:
  - `apps/api/src/inventory/cost/**` (new directory)
  - `apps/api/src/migrations/0028_*` + `0029_*` (slot-reserved per `migration-slot-reservation.md`)
  - `apps/api/src/app.module.ts` (single-line import; conflict-free per ai-playbook §17.3)
  - `apps/api/src/cost/cost.module.ts` (rebinds DI token — single-block change, conflict-free with M2 wave artifacts that have already merged)

  Disjoint from slices #2, #3, #6, #14, #16, #22 running in parallel.
- **Effort**: L (large — algorithmic complexity + property-based CSV fixture + 35+ tests). Estimated ~12-15 days per [[feedback_subagent_apply_typing_fix_cascade]] (subagent apply + CI babysit cascade for typing-fix iterations).
