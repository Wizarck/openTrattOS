## ADDED Requirements

### Requirement: RECIPE_COST_REBUILT payload carries the per-component breakdown

The `audit_log.payload_after` for `event_type='RECIPE_COST_REBUILT'` SHALL include a `components` array with one element per RecipeIngredient line, plus the rebuild's `reason` and total cost. Each component element contains `recipeIngredientId`, `costPerBaseUnit`, `totalCost` (line cost), and `sourceRefId`.

#### Scenario: cost rebuild emits enriched payload
- **WHEN** `cost.service.recordSnapshot(orgId, recipeId, reason)` runs
- **THEN** exactly one `audit_log` row is created with `event_type='RECIPE_COST_REBUILT'`, `aggregate_type='recipe'`, `aggregate_id=recipeId`; `payload_after.reason=reason`; `payload_after.totalCost=breakdown.totalCost`; `payload_after.components` is an array of length `breakdown.components.length` with each element matching the wire shape

#### Scenario: legacy thin payload from Wave 1.9 still readable
- **WHEN** `unpackHistoryRows()` encounters an audit_log row whose `payload_after` lacks the `components` field (a Wave 1.9 row, before this slice)
- **THEN** it produces a single totals row (with `componentRefId=null`) and no component rows; the absence of components is logged at debug level so operators can spot the data gap

### Requirement: `/cost-history` and `/cost-delta` endpoints query audit_log

The `cost.service.getHistory()` and `cost.service.computeCostDelta()` methods (backing `GET /recipes/:id/cost-history` and `GET /recipes/:id/cost-delta`) SHALL query the `audit_log` table for `event_type='RECIPE_COST_REBUILT'` rows in the requested window and unpack the `components` array. The `recipe_cost_history` table SHALL NOT be read.

#### Scenario: getHistory returns wire-shape rows for last 14 days
- **WHEN** a Manager calls `GET /recipes/:id/cost-history?organizationId=…&windowDays=14`
- **THEN** the response array contains one element per `(rebuild, component)` pair plus one totals element per rebuild; element shape is unchanged from Wave 1.9 (`id`, `recipeId`, `componentRefId`, `costPerBaseUnit`, `totalCost`, `sourceRefId`, `reason`, `computedAt`)

#### Scenario: computeCostDelta builds snapshots from audit_log rows
- **WHEN** a Manager calls `GET /recipes/:id/cost-delta?organizationId=…&from=…&to=…`
- **THEN** the per-component delta is computed from `payload_after.components` of the latest `RECIPE_COST_REBUILT` audit_log row at-or-before each boundary; component-name resolution (Ingredient / Recipe joins) and the `CostDeltaDto` wire shape are unchanged

### Requirement: `recipe_cost_history` table is dropped

Migration `0018_drop_recipe_cost_history.ts` SHALL backfill historical rebuilds from `recipe_cost_history` into `audit_log` with the new payload shape and DROP the legacy table + its indexes within a single transaction.

#### Scenario: existing recipe_cost_history rows backfilled atomically
- **WHEN** the migration runs against a database with N pre-existing `recipe_cost_history` rebuilds (each a group of `(recipe_id, computed_at)` rows)
- **THEN** N new `audit_log` rows are inserted with `event_type='RECIPE_COST_REBUILT'` and the components array reconstructed from the legacy rows; the `recipe_cost_history` table is dropped after the backfill commits

#### Scenario: down-migration restores legacy schema
- **WHEN** the migration is rolled back (`down()`)
- **THEN** `recipe_cost_history` table is recreated; existing audit_log RECIPE_COST_REBUILT rows are reverse-aggregated into N+1 legacy rows per audit row; those audit_log rows are then deleted to avoid double-rebuilds on a subsequent up-migration

### Requirement: cost domain no longer depends on RecipeCostHistory entity / repository

The `RecipeCostHistory` entity, its repository, and its module registration SHALL be removed. `cost.service.ts` injects `AuditLogService` instead of `RecipeCostHistoryRepository`.

#### Scenario: production code is RecipeCostHistory-free
- **WHEN** the slice is merged
- **THEN** `grep -rn "RecipeCostHistory" apps/api/src/` returns matches only in the migration files (0011 historical + 0018 the drop) and possibly archived spec files; no production source file imports the entity or the repository
