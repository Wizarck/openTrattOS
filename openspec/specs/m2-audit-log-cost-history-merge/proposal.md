## Why

`m2-audit-log` (Wave 1.9, PR #90) shipped the canonical `audit_log` table + `@OnEvent` subscriber. The investigation behind `m2-audit-log-cleanup` (archived as no-op 2026-05-06) found that the `recipe_cost_history` table is the **only** legacy audit-shaped table that could plausibly be subsumed — but the audit_log payload Wave 1.9 emits (`{reason, totalCost, componentCount}`) is too thin to replace it. The per-component breakdown that drives Journey 2 ("what changed?" via `/cost-delta`) lives only in `recipe_cost_history`.

This slice closes that gap. It enriches `RECIPE_COST_REBUILT.payload_after` to carry the full component array (atomically, one audit_log row per rebuild), migrates the two read-paths (`/cost-history` + `/cost-delta`) to query audit_log, backfills historical rebuilds from `recipe_cost_history` into the new shape, and drops `recipe_cost_history` + its entity + its repository.

After this slice, `audit_log` is the **single source of truth** for cost history. The `recipe_cost_history` table is gone; the entity + repository are removed. No double-write; no drift risk.

## What Changes

- **`RECIPE_COST_REBUILT` payload enriched** — `cost.service.recordSnapshot()` emits one audit envelope per rebuild whose `payload_after` is `{reason, totalCost, components: Array<{recipeIngredientId, costPerBaseUnit, totalCost, sourceRefId}>}`. Atomic per rebuild (vs Wave 1.9's thin payload + N+1 recipe_cost_history rows).
- **`getHistory(orgId, recipeId, windowDays)` migrated** — queries `audit_log` for `event_type='RECIPE_COST_REBUILT'` + `aggregate_type='recipe'` + `aggregate_id=recipeId` in window; unpacks each row's `payload_after.components[]` + the totals to produce the same `CostHistoryRowDto[]` response shape (one row per component plus a totals row per rebuild).
- **`computeCostDelta(orgId, recipeId, from, to)` migrated** — same query, builds two snapshots (latest payload-after at-or-before `from`; latest at-or-before `to`); component delta logic unchanged downstream of the new data source.
- **Migration `0018_drop_recipe_cost_history.ts`** — single transaction:
  1. `INSERT INTO audit_log` aggregating `recipe_cost_history` by `(recipe_id, computed_at)` with `array_agg` + `jsonb_build_object` to reconstruct snapshots in the new payload shape.
  2. `DROP TABLE recipe_cost_history` + its 2 indexes.
- **Entity + repository removed**: delete `apps/api/src/cost/domain/recipe-cost-history.entity.ts`, `apps/api/src/cost/infrastructure/recipe-cost-history.repository.ts`. Update `cost.module.ts` to remove the `TypeOrmModule.forFeature([RecipeCostHistory])` registration. Update `cost.service.ts` to remove `RecipeCostHistory` imports + the `RecipeCostHistoryRepository` constructor injection + the existing `RecipeCostHistory.create(...)` writes.
- **AuditLogSubscriber `RECIPE_COST_REBUILT` handler unchanged** — already accepts arbitrary envelope shapes; the new richer payload flows through.
- **DTO shape at the client unchanged** — `CostHistoryRowDto` + `CostDeltaDto` keep their wire format. Internal mapping changes from `RecipeCostHistory` row → DTO to `unpacked audit_log payload` → DTO.
- **BREAKING**: none at the client / API contract level. The DB-level breaking change (table dropped) is migrated atomically; rollback via reverse migration restores from audit_log.

## Capabilities

### New Capabilities

(none — this is a refactor of the existing cost-history capability onto canonical audit_log.)

### Modified Capabilities

- **`m2-cost-rollup-and-audit`** — backing storage migrates from `recipe_cost_history` to `audit_log`. Read-path semantics unchanged. Entity + repository removed.
- **`m2-audit-log`** — `RECIPE_COST_REBUILT` payload enriched (additive change, not breaking; Wave 1.9 backfilled rows have the thin shape and that gap is documented).

## Impact

- **Prerequisites**: `m2-audit-log` (Wave 1.9, squash `1e420a6`) merged. `recipe_cost_history` table populated by 7 prior cost-emitting slices.
- **Code**:
  - `apps/api/src/cost/application/cost.service.ts` — `recordSnapshot()` payload enriched; `getHistory()` + `computeCostDelta()` rewritten on top of audit_log; `RecipeCostHistoryRepository` dependency removed.
  - `apps/api/src/cost/cost.module.ts` — entity registration removed.
  - `apps/api/src/cost/domain/recipe-cost-history.entity.ts` — DELETED.
  - `apps/api/src/cost/infrastructure/recipe-cost-history.repository.ts` — DELETED.
  - `apps/api/src/cost/interface/dto/cost.dto.ts` — `CostHistoryRowDto` keeps wire shape; the `fromEntity` static is replaced by a `fromAuditUnpack` static that takes the unpacked shape.
  - `apps/api/src/migrations/0018_drop_recipe_cost_history.ts` — backfill + drop.
- **Tests**: `cost.service.spec.ts` updated to mock `AuditLogService.query()` instead of `RecipeCostHistoryRepository.findInWindow()`. `cost.service.int.spec.ts` (Postgres) updated similarly. New audit-log INT spec verifying the `getHistory()` round-trip via the bus.
- **Audit**: this slice IS the audit migration; once merged, every cost rebuild persists exclusively to audit_log going forward.
- **Storage**: net reduction. Pre-slice: ~N+1 rows per rebuild across `recipe_cost_history`. Post-slice: 1 row per rebuild in audit_log with components in jsonb. For a recipe with 20 components rebuilt 100×, pre = 2100 rows × ~120 B = ~250 KB; post = 100 rows × ~5 KB jsonb = ~500 KB. Slightly larger jsonb but row count drops 21×, which helps query plan + index size.
- **Performance**: query plan moves from `(recipe_id, computed_at DESC)` index on `recipe_cost_history` to `(organization_id, aggregate_type, aggregate_id, created_at DESC)` index on `audit_log` — already shipped in Wave 1.9. Both are O(log N) in the relevant rows. No regression expected.
- **Rollback**: reverse migration recreates `recipe_cost_history` table + indexes; backfills FROM audit_log (each row → 1 totals + N component rows); drops audit_log rebuilt rows. Symmetric to up-migration. No data loss.
- **Out of scope**:
  - `m2-audit-log-fts` (Wave 1.11) — full-text-search index.
  - `m2-audit-log-export` (Wave 1.12) — CSV export.
  - Further migrations (override jsonb columns, ai_suggestions audit fields) — those hold current state, NOT history; they stay where they are.
