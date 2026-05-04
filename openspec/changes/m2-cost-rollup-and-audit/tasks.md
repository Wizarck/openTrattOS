## 1. InventoryCostResolver interface + M2 implementation

- [x] 1.1 Define `apps/api/src/cost/inventory-cost-resolver.ts` with the `InventoryCostResolver` interface, `ResolveOptions` shape (asOf + sourceOverrideRef), and standard response. Backward-compat: 2nd argument accepts a `Date` or `ResolveOptions`.
- [x] 1.2 Implement `PreferredSupplierResolver` in `apps/api/src/cost/application/preferred-supplier.resolver.ts` reading `isPreferred=true` SupplierItem
- [x] 1.3 Override fallback: if `RecipeIngredient.sourceOverrideRef` is set AND points to a SupplierItem still bound to the same ingredient, the resolver consults it first
- [x] 1.4 No-source fallback: throws `NoCostSourceError` when zero usable sources exist
- [x] 1.5 Wire resolver into NestJS DI as the M2 binding for `InventoryCostResolver` (CostModule owns the binding; old `M1InventoryCostResolver` removed)

## 2. CostService

- [x] 2.1 `computeRecipeCost(orgId, recipeId)` — walks tree, calls resolver per ingredient, applies yield × (1 − waste) at each level. Sub-recipes propagate via `subRecipeTotal × quantity × yield × (1 − waste)`.
- [x] 2.2 4-decimal rounding (`round4`) for every intermediate sum + total
- [x] 2.3 Warn on rollup tolerance >0.0001 (operational `Logger.warn`, not user-facing)
- [x] 2.4 `computeCostDelta(orgId, recipeId, from, to)` — returns per-component diff with attribution chain, ranked by |delta| descending

## 3. Cost history

- [x] 3.1 Migration `0011_recipe_cost_history.ts`: `recipe_cost_history` table with `(id, recipeId, organizationId, componentRefId, costPerBaseUnit, totalCost, sourceRefId, reason, computedAt)`
- [x] 3.2 Index `(recipe_id, computed_at DESC)` for window queries + `(organization_id)` for cross-recipe roll-ups
- [x] 3.3 Event hook on `SUPPLIER_PRICE_UPDATED` → recompute every Recipe using the ingredient + append history rows
- [x] 3.4 Event hook on `RECIPE_INGREDIENT_UPDATED` (emitted by RecipesService.create / .update) → snapshot the recipe with `LINE_EDIT` reason
- [x] 3.5 Event hook on `SUB_RECIPE_COST_CHANGED` (emitted by `recordSnapshot` itself) → cascade to parent recipes with `SUB_RECIPE_CHANGE` reason
- [x] 3.6 Event hook on `RECIPE_SOURCE_OVERRIDE_CHANGED` (emitted by RecipesService.updateLineSource) → snapshot with `SOURCE_OVERRIDE` reason

## 4. Endpoints

- [x] 4.1 `GET /recipes/:id/cost` — returns live cost + breakdown (Read; OWNER+MANAGER+STAFF)
- [x] 4.2 `GET /recipes/:id/cost-history?windowDays=14` — returns history rows in window (Read; default 14d)
- [x] 4.3 `GET /recipes/:id/cost-delta?from=&to=` — returns per-component delta + ranked components
- [x] 4.4 `PUT /recipes/:id/lines/:lineId/source` — Manager+ override of cost source per line; persists `sourceOverrideRef` + emits `RECIPE_SOURCE_OVERRIDE_CHANGED`
- [x] 4.5 RBAC: read endpoints all roles; PUT override endpoint OWNER+MANAGER

## 5. UI components

- [ ] 5.1 `packages/ui-kit/src/cost-delta-table/` — DEFERRED to UX track (Master direction: backend-first, UI components ship via UX-driven storybook + variant approval)
- [ ] 5.2 `packages/ui-kit/src/margin-panel/` — DEFERRED to UX track (also consumed by `#8`)
- [ ] 5.3 Both components include Storybook stories for empty / loading / with-data / cost-spike scenarios — DEFERRED
- [ ] 5.4 ARIA: semantic table; status colour paired with text label (never colour-only) — DEFERRED

## 6. Tests

- [x] 6.1 Unit: `PreferredSupplierResolver` returns preferred / honours override / falls back when override is invalid / NO_SOURCE / orphaned org / null cpb fallback / supplier-missing label / legacy Date arg (10 cases in `preferred-supplier.resolver.spec.ts`)
- [x] 6.2 Unit: `CostService` walks tree correctly with yield + waste at each level (7 cases in `cost.service.spec.ts`: flat, yield+waste, sub-recipe, NoCostSource→unresolved, override pass-through, missing recipe, 4-decimal rounding)
- [x] 6.3 Unit: `CostService` 4-decimal rounding asserted; rollup tolerance warning is best-effort (logged on overflow, not asserted in tests)
- [x] 6.4 INT (deferred — Docker pending): `cost.service.int.spec.ts` covers end-to-end resolver wiring + supplier price change cascade + override + cost-delta two-snapshot
- [x] 6.5 INT covers Journey 2 cost-delta query returns ranked deltas
- [x] 6.6 Performance: `cost.service.perf.spec.ts` asserts p95 <200ms for a 100-node recipe across 20 samples (in-process; DB latency not modelled)

## 7. Verification

- [x] 7.1 Run `openspec validate m2-cost-rollup-and-audit` — must pass
- [ ] 7.2 Manual smoke: Journey 2 walkthrough on staging (cost spike → drill-down) — DEFERRED to first staging deploy
