## Context

The "live food cost" headline of M2 only works if (a) cost resolves through arbitrary sub-recipe trees, (b) it stays current when SupplierItem prices change, and (c) the chef can audit *what changed* between two timestamps. Journey 1 (recipe authoring) and Journey 2 (cost-spike investigation) depend on this slice. The architectural seam to M3 batch-aware cost (`InventoryCostResolver` per ADR-014) lives here.

## Goals / Non-Goals

**Goals:**
- `InventoryCostResolver` interface contract: stable signature M2 → M3, M2 implementation reads `isPreferred=true` SupplierItem (FR10–11).
- Live food-cost computation walking the sub-recipe tree (FR9).
- Per-component cost-history with configurable window (default 14d) (FR13).
- Recompute of dependent recipe costs on SupplierItem price changes (FR14).
- "What changed?" view (Journey 2): per-component delta with attribution (FR15).
- Manager override of cost source per RecipeIngredient line (FR12).
- `CostDeltaTable` and `MarginPanel` UI components.

**Non-Goals:**
- AI yield/waste suggestions: `#6`.
- Allergen aggregation: `#7`.
- Batch-aware cost (M3): out of M2 scope; M2 implements `InventoryCostResolver` against `isPreferred=true` SupplierItem only.

## Decisions

- **`InventoryCostResolver` as a stable interface** (`resolveBaseCost(ingredientId, asOf?)` → `{costPerBaseUnit, currency, source: {kind, refId, displayLabel}}`). **Rationale**: M3 swaps the implementation for batch-aware sources without touching M2 callers. Alternative: ad-hoc lookups in cost service — rejected because every M2 cost path would have to be rewritten in M3.
- **Cost computation is read-time, not stored**. **Rationale**: storing rolled-up cost goes stale on SupplierItem price changes; live computation is O(tree-size) ≈ O(N) where N ≤ 100 in realistic recipes — sub-millisecond. Cache invalidation > recomputation.
- **Cost-history table**: separate `recipe_cost_history` with `(recipeId, componentRefId, costPerBaseUnit, totalCost, sourceRefId, computedAt)`. Triggers append a row on every cost-affecting change (SupplierItem update, RecipeIngredient line edit, override). **Rationale**: chef needs "what changed?" with attribution — diff requires history.
- **Default window 14d** vs 7d/30d. **Rationale**: PRD §FR13 explicit; restaurant menus turn ~bi-weekly, so 14d catches a full menu cycle.
- **Precision: 4 decimal internal, 2 display, 0.01% rollup tolerance.** **Rationale**: ADR-016 + PRD §Technical Success. Decimal128 in DB; banker's rounding on display.

## Risks / Trade-offs

- [Risk] Cost-history table grows unbounded. **Mitigation**: archival job after 90d for high-volume orgs; M2 ships without it (acceptable for first-customer scale).
- [Risk] Recompute fan-out: a SupplierItem price change can affect thousands of MenuItems. **Mitigation**: recompute is read-time, so no batch update is needed. The dashboard query (`#9`) reads against `liveRecipeCost` accessor — one cost call per visible MenuItem.
- [Risk] Source override on RecipeIngredient changes the cost mid-recipe. **Mitigation**: `sourceOverrideRef` sits on the line itself per `#1`; resolver checks the override first, then falls back to preferred SupplierItem.

## Migration Plan

Steps:
1. `InventoryCostResolver` TypeScript interface published in `apps/api/src/cost/types.ts`.
2. M2 implementation `PreferredSupplierResolver` reads `isPreferred=true` from SupplierItem.
3. CostService aggregates: `computeRecipeCost(recipeId)` walks the tree, calls resolver per ingredient, applies yield + waste.
4. cost_history migration + insert hook on SupplierItem.priceUpdated event.
5. Endpoints: `GET /recipes/:id/cost`, `GET /recipes/:id/cost-history?window=14d`, `GET /recipes/:id/cost-delta?from=&to=`.
6. UI: `CostDeltaTable` (per-component diff), `MarginPanel` (cost / sellingPrice / margin / target — also consumed by `#8`).

Rollback: revert; no data loss (cost_history is additive). M3 pre-work won't be invalidated (interface is published).

## Open Questions

(none.)
