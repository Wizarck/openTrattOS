## 1. InventoryCostResolver interface + M2 implementation

- [ ] 1.1 Define `apps/api/src/cost/types.ts` with the `InventoryCostResolver` interface and standard response shape
- [ ] 1.2 Implement `PreferredSupplierResolver` in `apps/api/src/cost/preferred-supplier.resolver.ts` reading `isPreferred=true` SupplierItem
- [ ] 1.3 Override fallback: if RecipeIngredient line has `sourceOverrideRef`, resolver consults it first
- [ ] 1.4 No-source fallback: returns `{error: "NO_SOURCE", ingredientId}` when zero SupplierItems exist
- [ ] 1.5 Wire resolver into NestJS DI as the M2 binding for `InventoryCostResolver`

## 2. CostService

- [ ] 2.1 `computeRecipeCost(orgId, recipeId)` — walks tree, calls resolver per ingredient, applies yield × (1 − waste) at each level
- [ ] 2.2 Use Decimal128 (or equivalent 4-decimal precision) for all intermediate sums
- [ ] 2.3 Warn on rollup tolerance >0.01% (operational log, not user-facing)
- [ ] 2.4 `computeCostDelta(orgId, recipeId, from, to)` — returns per-component diff with attribution chain

## 3. Cost history

- [ ] 3.1 Migration: `recipe_cost_history` table with `(id, recipeId, componentRefId, costPerBaseUnit, totalCost, sourceRefId, computedAt)`
- [ ] 3.2 Index `(recipeId, computedAt DESC)` for window queries
- [ ] 3.3 Event hook on `SupplierItem.priceUpdated` → recompute affected Recipes + append history rows
- [ ] 3.4 Event hook on `RecipeIngredient.updated` → append history row for that line
- [ ] 3.5 Event hook on `Recipe.subRecipeCostChanged` (cascading) → append history row at parent level

## 4. Endpoints

- [ ] 4.1 `GET /recipes/:id/cost` — returns live cost with breakdown
- [ ] 4.2 `GET /recipes/:id/cost-history?window=14d` — returns history rows in window
- [ ] 4.3 `GET /recipes/:id/cost-delta?from=&to=` — returns per-component delta
- [ ] 4.4 `PUT /recipes/:id/lines/:lineId/source` — Manager+ override of cost source per line; persists `sourceOverrideRef`
- [ ] 4.5 RBAC: read endpoints all roles; PUT override endpoint Manager+ only

## 5. UI components

- [ ] 5.1 `packages/ui-kit/src/cost-delta-table/` — per-component diff with attribution column (Journey 2)
- [ ] 5.2 `packages/ui-kit/src/margin-panel/` — cost / sellingPrice / margin / target with status colour per ADR-016 (also consumed by #8)
- [ ] 5.3 Both components include Storybook stories for empty / loading / with-data / cost-spike scenarios
- [ ] 5.4 ARIA: semantic table; status colour paired with text label (never colour-only)

## 6. Tests

- [ ] 6.1 Unit: PreferredSupplierResolver returns preferred / honours override / NO_SOURCE
- [ ] 6.2 Unit: CostService walks tree correctly with yield + waste at each level
- [ ] 6.3 Unit: rollup tolerance warning fires when >0.01%
- [ ] 6.4 E2E: SupplierItem price change cascades to dependent Recipes (history rows appear)
- [ ] 6.5 E2E: Journey 2 cost-delta query returns ranked deltas with attribution
- [ ] 6.6 Performance: `GET /recipes/:id/cost` p95 <200ms for 100-node tree

## 7. Verification

- [ ] 7.1 Run `openspec validate m2-cost-rollup-and-audit` — must pass
- [ ] 7.2 Manual smoke: Journey 2 walkthrough on staging (cost spike → drill-down)
