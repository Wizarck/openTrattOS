## Context

M2 shipped `apps/api/src/cost/inventory-cost-resolver.ts` as a **deliberate seam**:

```ts
export interface InventoryCostResolver {
  resolveBaseCost(ingredientId, options?: ResolveOptions | Date): Promise<ResolvedCost>;
}
```

with two design properties:

1. The `asOf?: Date` option is reserved in the interface but documented as "M2 implementations may ignore it; M3 batch-aware resolvers honour it for FIFO/LIFO accounting" (`inventory-cost-resolver.ts` lines 33-37). M3 honours it.
2. M2 binds `PreferredSupplierResolver` against the `INVENTORY_COST_RESOLVER` symbol in `CostModule`. M3 swaps the binding — no call sites change.

M2 cost rollups are driven by `CostService.computeRecipeCost()` (`apps/api/src/cost/application/cost.service.ts` line 136). It walks the recipe tree via `foldRecipeTree`, calls `resolver.resolveBaseCost(line.ingredientId, { sourceOverrideRef })` per leaf line, and produces a `CostBreakdown`. The M3 resolver MUST satisfy this exact contract.

Slice #1 (`m3-lot-aggregate`, merged in commit 0dab33b) ships:
- `lots` table with `quantity_remaining`, `expires_at`, `received_at` columns
- Index `idx_lots_org_loc_available_fifo` (partial, WHERE `quantity_remaining > 0`)
- `LotRepository.findAvailableFifo(organizationId, locationId, ingredientId, asOf)` returning lots sorted by `received_at` ASC with `expires_at` ASC tiebreaker

This slice consumes that repository method. No new database tables — only two new columns (slice #4 owns them, see ADR-COST-STRATEGY-PER-PRODUCT).

## Goals / Non-Goals

**Goals**:

- **FIFO algorithm** — oldest-received-first, partial-lot consumption, walks the queue until `qtyNeeded == 0` or queue exhausted.
- **FEFO algorithm** — nearest-expiry-first; `NULL expires_at` (shelf-stable items: oil, salt) sort LAST; tiebreaker is `received_at` ASC then `id` for deterministic order.
- **Pure functions** — no DB writes, no event emit, no audit row. Same input → same output, every time.
- **Strategy selection** — per-product attribute on `products.cost_resolution_strategy`; per-organization policy override on `organizations.cost_resolution_policy_override` (NULL = inherit from product).
- **Property-based CSV fixture** — 50+ canonical (input → expected) cases. Test harness loops over the CSV per [[reference_eligia_dashboard_ai_obs]] property-test pattern.
- **Insufficient-inventory contract** — explicit `InsufficientInventoryError` with the gap quantity in the message. No partial resolution returned (caller must decide whether to fall back to M2 supplier price or surface the shortage).
- **Multi-tenant invariant** — `organizationId` is the first parameter of every public method; never optional.
- **Bind M3 resolver behind feature flag** — `M3_COST_RESOLVER_ENABLED` env flag in `cost.module.ts`. M2 `PreferredSupplierResolver` stays available as fallback.

**Non-Goals**:

- Snapshot persistence (writing the resolved breakdown to `audit_log`). Reserved for slice #5 (`m3-cost-snapshot-persistence`).
- `COST_SNAPSHOT_RECORDED` event registration / emission. Reserved for slice #5.
- Lot creation, mutation, or `quantity_remaining` decrement. Reserved for slices #2 (consumption events) + #7 (GR reconciliation).
- LIFO / weighted-average / standard-cost strategies. Out of M3 scope (open question in PRD-m3 §Open Questions row 4 — addressed only if a customer asks).
- Per-recipe strategy override. Rejected here (see ADR-COST-STRATEGY-PER-PRODUCT alternatives). M3.x followup if requested.
- UX for setting strategy. Org admin updates the column via direct DB / SQL in MVP. Admin screen deferred to M3.x.
- Migrating M2 callers off `PreferredSupplierResolver`. The DI swap is the entire migration; M2 callers are unaware.

## Decisions

### ADR-COST-STRATEGY-PER-PRODUCT — strategy attribute lives on `products` with org-level override

**Decision**: cost strategy is selected by a 2-level lookup:
1. **Product default**: `products.cost_resolution_strategy text NOT NULL DEFAULT 'FIFO' CHECK (cost_resolution_strategy IN ('FIFO','FEFO','MANUAL'))`. Added in migration 0028.
2. **Org-level override**: `organizations.cost_resolution_policy_override text NULL CHECK (cost_resolution_policy_override IS NULL OR cost_resolution_policy_override IN ('FIFO','FEFO'))`. Added in migration 0029.

Resolution rule: `selectStrategy(product, org) = org.cost_resolution_policy_override ?? product.cost_resolution_strategy`. The org override is the **cross-cutting policy lever** — set to `'FEFO'` and every product respects FEFO regardless of per-product default. NULL (default) means "respect per-product defaults".

`'MANUAL'` is reserved for products that should fall back to the M2 supplier-list-price path (e.g., contract-priced spices); product-level only, NOT a valid org-override value.

**Alternatives considered**:

1. **Per-recipe strategy override**. Rejected: a recipe-line is *consuming* lots, not *deciding* costing rules. Mixing the two creates a "why is my bolognese €0.20 more this week?" debug nightmare. Org policy + product default is the standard restaurant-industry pattern (Sodexo, Aramark configure per-product + per-property override).
2. **Single org-wide strategy only** (no per-product). Rejected: olive oil (shelf-stable, FIFO appropriate) and lettuce (perishable, FEFO appropriate) cannot share a single strategy without losing audit clarity. PRD-m3 §Industry Context line 16 ("matching the HACCP physical flow used by McDonald's") implies multiple physical flows per kitchen.
3. **Per-recipe-line strategy override**. Rejected: same reason as #1 + amplifies the test surface 100×.
4. **JSONB column with arbitrary metadata**. Rejected: `text` + CHECK constraint is faster to query (indexed), easier to grep, and matches M2 `recipes.waste_factor` precedent.

**Trade-off**: org-policy override is a **global lever** — flipping `cost_resolution_policy_override='FEFO'` org-wide affects all cost computations org-wide. Mitigated by audit-log entry on any org-policy change (slice #5 wires this; not in this slice).

### ADR-COST-RESOLVER-INTERFACE — `resolveCost` signature for M3 batch-aware path

**Decision**: M3 resolver exposes a NEW typed method `resolveCost` on `InventoryCostResolverServiceM3`:

```ts
async resolveCost(input: {
  organizationId: string;
  locationId: string;
  productId: string;        // M2 uses ingredientId; M3 normalises to productId
  quantity: number;          // amount needed in product's base unit
  asOfTime: Date;            // for historical resolution; defaults to now() at call site
  strategyOverride?: Strategy; // power-user / test-fixture lever; bypasses selectStrategy()
}): Promise<CostResolution>;

interface CostResolution {
  totalCost: number;           // sum(breakdown.subtotal), rounded numeric(18,4)
  currency: string;            // ISO 4217 from organization.currencyCode
  strategy: Strategy;          // which strategy actually ran (after selectStrategy)
  breakdown: CostBreakdownLine[];
  remainingLots: LotCostRow[]; // post-consumption state for downstream snapshot (slice #5 reads this)
  asOfTime: Date;              // echo back for audit traceability
}

interface CostBreakdownLine {
  lotId: string;
  qty: number;        // amount consumed from this lot
  unitCost: number;   // €/base-unit stamped on the lot at GR time (slice #7 sets this)
  subtotal: number;   // qty * unitCost, rounded numeric(18,4)
  receivedAt: Date;   // for audit traceability
  expiresAt: Date | null;
}
```

The M2 `InventoryCostResolver.resolveBaseCost` method stays on `InventoryCostResolverServiceM3` for backwards compatibility — it internally calls `resolveCost(quantity=1, asOfTime=now)` and projects to the M2 `ResolvedCost` shape. M2 `CostService.computeRecipeCost()` keeps working without changes.

**Why a new method instead of overloading `resolveBaseCost`?** The M2 method returns ONE row's cost-per-unit; the M3 method returns a multi-lot breakdown. Overloading the return type would break TypeScript inference at every call site. New method, clean DI shape.

**Inline types per [[feedback_subagent_apply_typing_fix_cascade]]**: types live in `apps/api/src/inventory/cost/domain/types.ts`. No extraction to `packages/contracts/`. Zod schemas alongside (`.min(1)`, not `.nonempty()`).

### ADR-COST-FEFO-NULLS — NULL `expires_at` sort LAST

**Decision**: when sorting lots by FEFO, lots with `expires_at IS NULL` (shelf-stable items: oil, salt, dry pasta) sort LAST. Within the NULL group, secondary sort is `received_at` ASC. Within the non-NULL group, secondary sort is `received_at` ASC; tertiary sort is `id` (lexicographic) for deterministic total ordering.

Postgres `ORDER BY expires_at ASC NULLS LAST` natively supports this. The pure TS resolver does the same in JS:

```ts
sortedLots = lots.sort((a, b) => {
  if (a.expiresAt === null && b.expiresAt === null) return cmpReceivedThenId(a, b);
  if (a.expiresAt === null) return 1;   // a goes last
  if (b.expiresAt === null) return -1;  // b goes last
  const expCmp = a.expiresAt.getTime() - b.expiresAt.getTime();
  return expCmp !== 0 ? expCmp : cmpReceivedThenId(a, b);
});
```

**Rationale**: FEFO is fundamentally about expiry-driven prioritisation. Items without an expiry have no urgency signal — they should consume LAST so urgency-bearing items consume first. McDonald's standard operating procedure documents this; HACCP physical flow expects it.

**Alternative considered**: sort NULLs FIRST. Rejected: violates FEFO semantics ("consume what's about to expire") and confuses operators who see "salt got consumed before the lettuce that expires tomorrow".

### ADR-COST-PARTIAL-LOT-CONSUMPTION — `min(remaining, needed)` per lot

**Decision**: a single resolution can consume **partial** quantity from a lot. Example: recipe needs 1.5 kg of tomato; the oldest lot has 5 kg remaining. The resolver takes 1.5 kg from that lot, returns a single-row breakdown, and the lot's `remainingLots` entry shows 3.5 kg left.

Algorithm:

```ts
function walkQueue(sortedLots: LotCostRow[], qtyNeeded: number): WalkResult {
  const breakdown: CostBreakdownLine[] = [];
  const remainingLots: LotCostRow[] = [];
  let needed = qtyNeeded;
  for (const lot of sortedLots) {
    if (needed === 0) {
      remainingLots.push(lot);
      continue;
    }
    const take = Math.min(lot.quantityRemaining, needed);
    breakdown.push({
      lotId: lot.id,
      qty: take,
      unitCost: lot.unitCostAtReceived,
      subtotal: round4(take * lot.unitCostAtReceived),
      receivedAt: lot.receivedAt,
      expiresAt: lot.expiresAt,
    });
    const newRemaining = lot.quantityRemaining - take;
    if (newRemaining > 0) {
      remainingLots.push({ ...lot, quantityRemaining: newRemaining });
    }
    // else: lot fully consumed, drop from remainingLots
    needed -= take;
  }
  if (needed > 0) {
    throw new InsufficientInventoryError(organizationId, productId, qtyNeeded, qtyNeeded - needed);
  }
  return { breakdown, remainingLots };
}
```

**Numerical precision**: `numeric(18,4)` everywhere (matches M2 ROLLUP_TOLERANCE = 0.0001 per ADR-016). All multiplications go through `round4()`. The test suite asserts `sum(breakdown.subtotal) === totalCost` bit-for-bit within 0.0001.

**Trade-off**: walking the queue is O(k) where k = number of lots consumed. Typical k = 1-3 per recipe-line. Pathological k = ~20 if hundreds of tiny lots exist for one product — still sub-millisecond.

### ADR-COST-INSUFFICIENT-INVENTORY — throw, don't return partial

**Decision**: when `sum(lot.quantityRemaining) < qtyNeeded`, throw `InsufficientInventoryError`. Do NOT return a partial breakdown.

```ts
class InsufficientInventoryError extends Error {
  readonly organizationId: string;
  readonly productId: string;
  readonly quantityRequested: number;
  readonly quantityAvailable: number;
  readonly quantityShortfall: number;
  constructor(orgId, productId, requested, available) {
    super(`Insufficient inventory for product ${productId} in org ${orgId}: requested ${requested}, available ${available} (shortfall ${requested - available})`);
    /* ... */
  }
}
```

**Rationale**: a partial resolution silently understates cost rollups — exactly the kind of silent-corruption bug we hunted in M2 cost-rollup retros. Throwing forces the caller (M2 `CostService` or future M3 menu-rollup caller) to make an explicit choice: surface the shortage to the operator, fall back to M2 supplier price, or skip the line.

**Caller behaviour** (M2 `CostService.computeRecipeCost` line 213-228 already catches `NoCostSourceError` and emits an `unresolved` component): M3 introduces a parallel catch block for `InsufficientInventoryError` that sets `unresolved: true` and surfaces the gap in the component. Implementation detail, not in this slice — left as a follow-up note in slice #5.

**Alternative considered**: return `{ partial: true, breakdown, shortfall }`. Rejected: changes the success-path return shape (now nullable / sometimes-defined fields), forces every downstream caller into defensive coding. Exception is the cleaner contract.

### ADR-COST-PROPERTY-TEST-CSV — 50+ cases in CSV, harness loops

**Decision**: property-based test fixture lives at `apps/api/src/inventory/cost/__fixtures__/fifo-fefo-cases.csv` with this schema:

```csv
case_id,strategy,lots_json,qty_requested,expected_total_cost,expected_breakdown_json,expected_remaining_lots_json,expected_error
fifo-001,FIFO,"[{""id"":""L1"",""receivedAt"":""2026-05-01"",""qtyRemaining"":10,""unitCost"":2.5,""expiresAt"":null}]",5,12.5,"[{""lotId"":""L1"",""qty"":5,""subtotal"":12.5}]","[{""id"":""L1"",""qtyRemaining"":5}]",
fifo-002,FIFO,"[{""id"":""L1"",""receivedAt"":""2026-05-01"",""qtyRemaining"":3,""unitCost"":2.5},{""id"":""L2"",""receivedAt"":""2026-05-02"",""qtyRemaining"":10,""unitCost"":3.0}]",5,13.5,"[{""lotId"":""L1"",""qty"":3,""subtotal"":7.5},{""lotId"":""L2"",""qty"":2,""subtotal"":6.0}]","[{""id"":""L2"",""qtyRemaining"":8}]",
fefo-001,FEFO,"[{""id"":""L1"",""expiresAt"":""2026-06-15"",""qtyRemaining"":10,""unitCost"":2.5},{""id"":""L2"",""expiresAt"":""2026-06-01"",""qtyRemaining"":10,""unitCost"":3.0}]",5,15.0,"[{""lotId"":""L2"",""qty"":5,""subtotal"":15.0}]","[{""id"":""L1"",""qtyRemaining"":10},{""id"":""L2"",""qtyRemaining"":5}]",
fefo-null-001,FEFO,"[{""id"":""L1"",""expiresAt"":null,""qtyRemaining"":10,""unitCost"":2.5},{""id"":""L2"",""expiresAt"":""2026-06-15"",""qtyRemaining"":10,""unitCost"":3.0}]",5,15.0,"[{""lotId"":""L2"",""qty"":5,""subtotal"":15.0}]","[{""id"":""L1"",""qtyRemaining"":10},{""id"":""L2"",""qtyRemaining"":5}]",
err-shortage-001,FIFO,"[{""id"":""L1"",""qtyRemaining"":3,""unitCost"":2.5}]",10,,,,InsufficientInventoryError
```

**Columns**:
- `case_id` — stable identifier (`<strategy>-<topic>-<seq>`) so a failing assertion points at the exact row.
- `strategy` — `FIFO` / `FEFO`.
- `lots_json` — JSON array of `LotCostRow` (subset fields acceptable — missing `receivedAt` defaulted to `1970-01-01`, missing `expiresAt` defaulted to null).
- `qty_requested` — input quantity in base units.
- `expected_total_cost` — empty when an error is expected.
- `expected_breakdown_json` — full breakdown JSON (subset asserted).
- `expected_remaining_lots_json` — post-consumption lot state.
- `expected_error` — error class name (empty for success cases).

**Harness**: `cost.service.property.spec.ts` reads the CSV via `csv-parse/sync` (CJS interop per [[feedback_subagent_apply_typing_fix_cascade]]), loops over each row, calls the pure resolver, asserts against expectations. Failure messages include the `case_id` for surgical fixing.

**Case categories** (~50 total):
- FIFO basic (single lot, exact qty): ~5 cases
- FIFO multi-lot walk: ~8 cases
- FIFO partial consumption: ~5 cases
- FEFO basic: ~5 cases
- FEFO with NULL expiries: ~5 cases
- FEFO tiebreakers (same expiry, different received): ~5 cases
- Edge cases (exhausted lot at front, zero-qty request): ~7 cases
- Error cases (global shortage, empty queue): ~5 cases
- Mixed unit-cost progression (price increase / decrease across lots): ~5 cases

**Why CSV not JSON?** Easier to diff in PR review; spreadsheet-editable for restaurant-domain reviewers (Carlo, Murat). One row per case = one diff line.

### ADR-COST-NO-AUDIT-EMIT-HERE — resolver is pure, slice #5 persists

**Decision**: this slice writes NOTHING to `audit_log` and emits NO events.

`InventoryCostResolverServiceM3.resolveCost()`:
- READS from `lots` (via `LotRepository.findAvailableFifo`)
- READS from `products.cost_resolution_strategy`
- READS from `organizations.cost_resolution_policy_override`
- COMPUTES the breakdown
- RETURNS the `CostResolution`
- NO `INSERT` / `UPDATE` / `DELETE`
- NO `eventEmitter.emit*()` calls

Slice #5 (`m3-cost-snapshot-persistence`) wraps this method, persists the breakdown to `audit_log` as a `COST_SNAPSHOT_RECORDED` envelope, and only THEN emits the corresponding `@OnEvent`-bus event. Per the M2 `recordSnapshot` pattern (`cost.service.ts` line 478-520) the wrapping service uses `emitAsync` for read-after-write consistency.

**Rationale**: keeping the resolver pure is a deliberate testability invariant — the same fixture row + strategy MUST produce the same breakdown bit-for-bit, run after run, with no side effects. Property-based CSV tests rely on this.

**Trade-off**: forces a thin wrapper in slice #5 (~50 LOC). Acceptable.

### ADR-COST-DI-FEATURE-FLAG — env-flagged DI swap during M3 rollout

**Decision**: `cost.module.ts` reads `process.env.M3_COST_RESOLVER_ENABLED` at module construction. When `'true'`, binds `INVENTORY_COST_RESOLVER` to `InventoryCostResolverServiceM3`; otherwise keeps M2 `PreferredSupplierResolver`. Default: `'true'` (M3-on).

```ts
providers: [
  PreferredSupplierResolver,                  // always available
  InventoryCostResolverServiceM3,             // new
  {
    provide: INVENTORY_COST_RESOLVER,
    useFactory: (m3: InventoryCostResolverServiceM3, m2: PreferredSupplierResolver) =>
      process.env.M3_COST_RESOLVER_ENABLED === 'false' ? m2 : m3,
    inject: [InventoryCostResolverServiceM3, PreferredSupplierResolver],
  },
],
```

**Rationale**: if the M3 resolver hits an unexpected production issue (e.g., lots with NULL `unitCostAtReceived` from a partial slice-#7 migration), flipping `M3_COST_RESOLVER_ENABLED=false` instantly reverts to M2 list-price costing without redeploy. Standard feature-flag pattern; matches M2 `m2-feature-flag-cost-history` (Wave 1.10).

**Trade-off**: two code paths during the transition (~1 release cycle). The flag is removed (M2 fallback path deleted) once slice #5 + slice #7 ship and at least one production customer runs M3 cost rollups successfully for 7 days.

## Risks / Trade-offs

- **[Risk]** Slice #7 (`m3-gr-aggregate-reconciliation`) hasn't shipped yet, which means lots created today via direct SQL fixtures lack a stamped `unitCostAtReceived` column. **Mitigation**: this slice's INT tests seed lots with `unitCostAtReceived` explicitly; production rollout coordinates with slice #7 (cost-resolver feature flag stays `'false'` until slice #7 ships).
- **[Risk]** Strategy column added at the product table — a future "per-recipe-line override" feature would need a new column. **Mitigation**: per ADR-COST-STRATEGY-PER-PRODUCT we deliberately rejected per-line override. If a customer asks, M3.x adds `recipe_ingredient.cost_strategy_override` and the selector chain becomes `line → org → product`.
- **[Risk]** Pure-function constraint conflicts with M2 `CostService.computeRecipeCost` patterns that DO emit events. **Mitigation**: the M3 service exposes BOTH `resolveBaseCost` (M2-compatible, pure projection of `resolveCost`) AND `resolveCost` (M3-native, pure compute). The "emit events" path stays in `CostService.recordSnapshot()` which slice #5 will adapt.
- **[Risk]** Property-test CSV becomes stale as new edge cases emerge. **Mitigation**: per [[feedback_subagent_apply_typing_fix_cascade]], the CSV is **append-only in the same PR that fixes a bug** — any failing manual test gets reduced to a CSV row + commit. Codified in `tasks.md` group 12.
- **[Trade-off]** `numeric(18,4)` precision limit is ±0.00005 per multiplication. Hundred-line recipe with worst-case error compounding = ±0.005 cumulative. Acceptable for restaurant margin accounting (sub-cent error band). Matches M2 ROLLUP_TOLERANCE = 0.0001 per ADR-016.
- **[Trade-off]** Org-policy override is a global lever — flipping it changes ALL cost computations org-wide. Mitigated by audit-log entry on any policy change (slice #5 will wire this).

## Migration Plan

**Schema migrations** (numbered per slot reservation):
- `0028_add_cost_resolution_strategy_to_products.ts` — adds `cost_resolution_strategy text NOT NULL DEFAULT 'FIFO' CHECK (cost_resolution_strategy IN ('FIFO','FEFO','MANUAL'))`. Reversible via column drop.
- `0029_add_cost_resolution_policy_to_orgs.ts` — adds `cost_resolution_policy_override text NULL CHECK (cost_resolution_policy_override IS NULL OR cost_resolution_policy_override IN ('FIFO','FEFO'))`. Reversible via column drop.

**Backfill**: no backfill needed. New rows default to `'FIFO'` (matches M2 behaviour for shelf-stable products that are the default M2 assumption). Perishable products get tagged `'FEFO'` in slice #7 during GR-side classification (out of scope here).

**Feature flag rollout sequence**:
1. Slice #4 (this slice) merges. `M3_COST_RESOLVER_ENABLED=false` in production env (M2 path stays canonical).
2. Slice #7 merges (GR creates lots with `unitCostAtReceived`).
3. Slice #5 merges (snapshot persistence).
4. Operations flips `M3_COST_RESOLVER_ENABLED=true` in production. M3 path becomes canonical.
5. After 7 days of incident-free operation, the M2 `PreferredSupplierResolver` DI fallback is removed (followup PR).

## Open Questions

- **Q1**: should the `MANUAL` strategy resolve to a per-product `manual_cost_per_base_unit` column or fall back to the M2 `PreferredSupplierResolver`? **Provisional**: fall back to M2 — keeps the column schema simpler and matches the "M2 is the manual default" mental model. Revisit if a customer requests a true manual override.
- **Q2**: should `asOfTime` historical resolution walk the `audit_log` for past lot states (slow), or are we OK with "only current `quantity_remaining` matters" semantics? **Provisional**: current state only — historical resolution is reserved for slice #5 (snapshot persistence) which materialises the breakdown at recordSnapshot time.
- **Q3**: should we expose strategy selection via MCP capability (`inventory.set-cost-strategy`)? **Provisional**: no — MVP, direct SQL UPDATE is fine. Defer to M3.x admin UX.
