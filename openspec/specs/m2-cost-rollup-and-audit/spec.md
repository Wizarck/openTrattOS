## ADDED Requirements

### Requirement: InventoryCostResolver provides stable seam to batch-aware cost (M3)

The system SHALL expose an `InventoryCostResolver` interface that resolves the cost-per-base-unit for any Ingredient. M2 implements it backed by `isPreferred=true` SupplierItem; M3 swaps the implementation without changing callers.

#### Scenario: Resolver returns preferred SupplierItem cost in M2
- **WHEN** the resolver is called with an Ingredient that has 3 SupplierItems (one marked `isPreferred=true`)
- **THEN** the response is `{costPerBaseUnit, currency, source: {kind: "supplier-item", refId, displayLabel}}` from the preferred SupplierItem

#### Scenario: Override on RecipeIngredient takes precedence
- **WHEN** a RecipeIngredient line carries `sourceOverrideRef` pointing to a non-preferred SupplierItem
- **THEN** the resolver returns the cost from the override SupplierItem; `source.refId` reflects the override

#### Scenario: Resolver fails gracefully when no SupplierItem exists
- **WHEN** the resolver is called for an Ingredient with zero SupplierItems
- **THEN** the response is `{error: "NO_SOURCE", ingredientId}`; callers downstream surface this as "cost unknown" in UI

### Requirement: Recipe live cost walks sub-recipe tree

The system SHALL compute live recipe cost by walking the sub-recipe tree, summing `(resolvedCost × quantity × yield × (1 − waste))` per component at each level.

#### Scenario: Flat recipe with 3 ingredients
- **WHEN** `GET /recipes/:id/cost` is called for a recipe with 3 ingredient lines and `wasteFactor=0.05`
- **THEN** the response returns `{totalCost, currency, breakdown: [{lineId, ingredient, qtyBase, costContribution}]}` summing per line × yield × (1 − 0.05)

#### Scenario: Sub-recipe nesting walks correctly
- **WHEN** the recipe contains a sub-recipe component with its own waste + yield
- **THEN** the cost recurses: sub-recipe cost is computed, multiplied by parent line quantity × parent yield × (1 − parent waste)

#### Scenario: Performance NFR
- **WHEN** the recipe tree has up to 100 nodes (realistic max)
- **THEN** the cost computation completes in <200ms p95 (PRD Performance NFR)

### Requirement: Cost history records every cost-affecting change

The system SHALL append rows to `recipe_cost_history` whenever a cost-affecting event occurs: SupplierItem price update, RecipeIngredient line edit, source override, sub-recipe price change.

#### Scenario: SupplierItem price update triggers history rows
- **WHEN** a SupplierItem price changes
- **THEN** for every Recipe that references the affected Ingredient (directly or via sub-recipe), a `recipe_cost_history` row is appended with `(recipeId, componentRefId, costPerBaseUnit, totalCost, sourceRefId, computedAt)`

#### Scenario: Default 14d window for history queries
- **WHEN** `GET /recipes/:id/cost-history` is called without a window param
- **THEN** the response returns rows with `computedAt` within the last 14 days, sorted descending

#### Scenario: Custom window respected
- **WHEN** `GET /recipes/:id/cost-history?window=30d` is called
- **THEN** the response returns rows from the last 30 days

### Requirement: "What changed?" view returns per-component delta with attribution

The system SHALL expose `GET /recipes/:id/cost-delta?from=<ts>&to=<ts>` returning per-component cost delta between two timestamps with attribution (which source caused the change).

#### Scenario: Cost-spike investigation (Journey 2)
- **WHEN** Lourdes queries `/recipes/:id/cost-delta?from=<7d ago>&to=<now>` after noticing a cost rise
- **THEN** the response returns `{deltas: [{componentRefId, ingredient, costThen, costNow, delta, sourceRefId, sourceLabel, attributedChange}]}` per component sorted by absolute delta descending

#### Scenario: Component with no change is excluded
- **WHEN** an ingredient cost did not change in the window
- **THEN** that line is excluded from the deltas array (only changed components surface)

#### Scenario: Sub-recipe attribution surfaces nested changes
- **WHEN** a sub-recipe's cost changed because of an underlying ingredient
- **THEN** the delta entry shows the sub-recipe ID + attribution chain to the underlying ingredient

### Requirement: Cost computation precision is 4 decimals internal, 2 display, 0.01% rollup tolerance

The system SHALL store costs with 4 decimal places internally, round to 2 decimals on display, and assert rollup tolerance of 0.01% per ADR-016.

#### Scenario: Internal precision preserved through tree walk
- **WHEN** the cost tree is computed for a deep recipe
- **THEN** intermediate sums use 4-decimal decimals; only the final user-facing display is rounded

#### Scenario: Rollup tolerance enforced
- **WHEN** a recipe's manually-summed cost differs from the rolled-up cost by >0.01%
- **THEN** the cost service emits a warning log (operations check, not user-facing)
