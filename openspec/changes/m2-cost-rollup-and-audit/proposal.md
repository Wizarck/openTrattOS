## Why

The "live food cost" headline of M2 only works if (a) cost resolves through arbitrary sub-recipe trees, (b) it stays current when underlying SupplierItem prices change, and (c) the chef can audit *what changed* between two timestamps. Journey 1 (recipe authoring) and Journey 2 (cost-spike investigation) both depend on this slice. The architectural seam to M3 batch-aware cost (`InventoryCostResolver` per ADR-011) lives here.

## What Changes

- `InventoryCostResolver` interface contract (architectural seam, ADR-011): stable signature M2 → M3, M2 implementation reads `isPreferred=true` SupplierItem (FR10–11).
- Live food-cost computation walking the sub-recipe tree, summing `(ingredient cost × quantity × yield × (1 − waste))` per component (FR9).
- Per-component cost-history with configurable window (default 14d), identifying the responsible source and price change (FR13).
- Recompute of dependent recipe costs when an underlying SupplierItem price changes (FR14).
- "What changed?" view (Journey 2): per-component delta of Recipe cost between two timestamps with attribution (FR15).
- Manager can override the default cost source per RecipeIngredient line (FR12).
- `CostDeltaTable` and `MarginPanel` UI components (the latter shared with #8).
- Precision: 4 decimal internal, 2 display, 0.01% rollup tolerance per ADR-016.
- **BREAKING** (none.)

## Capabilities

### New Capabilities

- `m2-cost-rollup-and-audit`: live cost engine + cost-history + "what changed?" audit. Includes `InventoryCostResolver` seam.

### Modified Capabilities

(none.)

## Impact

- **Prerequisites**: `#1 m2-data-model`, `#2 m2-recipes-core`.
- **Code**: `apps/api/src/cost/` (resolver + service), `apps/api/src/recipes/` extensions for cost endpoints, `packages/ui-kit/src/cost-delta-table/` and `packages/ui-kit/src/margin-panel/`.
- **API surface**: `GET /recipes/:id/cost`, `GET /recipes/:id/cost-history`, `GET /recipes/:id/cost-delta?from=&to=`. Pricing endpoints respect the `InventoryCostResolver` contract and stay stable when M3 swaps the implementation for batch-aware cost.
- **Performance**: live cost update <200ms (NFR interaction responsiveness).
- **Out of scope**: AI suggestion of yield/waste (#6) — purely the cost resolver here.
