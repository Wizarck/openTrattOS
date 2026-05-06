## 1. Update RECIPE_COST_REBUILT payload shape

- [ ] 1.1 In `cost.service.ts::recordSnapshot()`, replace the `payload_after = {reason, totalCost, componentCount}` with the new shape `{reason, totalCost, components: [{recipeIngredientId, costPerBaseUnit, totalCost, sourceRefId}, ...]}`. Components built from `breakdown.components`.
- [ ] 1.2 Remove `recipe_cost_history` writes from `recordSnapshot()` (loop building `rows[]` + the totals row + `em.getRepository(RecipeCostHistory).save(rows)`). The audit_log emit becomes the only persistence.
- [ ] 1.3 Add `AuditLogService` to `cost.service.ts` constructor injection (replaces `RecipeCostHistoryRepository`).

## 2. Migrate read paths

- [ ] 2.1 Add `unpackHistoryRows(auditRow: AuditLog): CostHistoryUnpacked[]` helper in `cost/application/`:
  - For each audit row with `payload_after.components` array → produces 1 totals row (`componentRefId=null, totalCost=payload.totalCost`) + N component rows (one per element).
  - For each row WITHOUT `components` array (Wave 1.9 thin payload) → produces 1 totals row only; no components.
  - Synthetic `id` = `<auditLogRowId>:<componentRefId|'totals'>`.
- [ ] 2.2 Rewrite `getHistory(orgId, recipeId, windowDays)`:
  - Query `auditLog.query({ organizationId, aggregateType:'recipe', aggregateId:recipeId, eventTypes:['RECIPE_COST_REBUILT'], since:from, until:to, limit:AUDIT_LOG_MAX_LIMIT })`.
  - `flatMap(unpackHistoryRows)` and return.
- [ ] 2.3 Rewrite `computeCostDelta(orgId, recipeId, from, to)`:
  - Same audit_log query with `since=new Date(0), until=to`.
  - Build `Snapshot` from latest audit row at-or-before each boundary (one row per rebuild now, vs the old loop over multiple rows per `computed_at`).
  - Component delta logic + name resolution unchanged.

## 3. DTO migration

- [ ] 3.1 In `cost/interface/dto/cost.dto.ts`: replace `CostHistoryRowDto.fromEntity(h: RecipeCostHistory)` with `CostHistoryRowDto.fromAuditUnpack(u: CostHistoryUnpacked)`. Wire shape preserved. Synthetic id format documented.
- [ ] 3.2 Update `recipes-cost.controller.ts::getHistory` to call the new mapper.

## 4. Module + dependency cleanup

- [ ] 4.1 `cost.module.ts`:
  - Remove `TypeOrmModule.forFeature([RecipeCostHistory])` entry.
  - Remove `RecipeCostHistory` + `RecipeCostHistoryRepository` imports + provider.
  - Add `AuditLogModule` to `imports` (so `AuditLogService` is injectable).
- [ ] 4.2 Delete `apps/api/src/cost/domain/recipe-cost-history.entity.ts`.
- [ ] 4.3 Delete `apps/api/src/cost/infrastructure/recipe-cost-history.repository.ts`.
- [ ] 4.4 Delete `apps/api/src/cost/domain/recipe-cost-history.entity.spec.ts` (no longer applicable).

## 5. Migration 0018

- [ ] 5.1 `apps/api/src/migrations/0018_drop_recipe_cost_history.ts`:
  - `up()`: backfill INSERT INTO audit_log via `array_agg` + `jsonb_build_object` grouped by `(organization_id, recipe_id, computed_at)`; then DROP INDEXes + TABLE.
  - `down()`: CREATE TABLE recipe_cost_history (same schema as 0011); INSERT FROM audit_log RECIPE_COST_REBUILT rows expanding components array + totals; DELETE FROM audit_log WHERE event_type='RECIPE_COST_REBUILT'.
- [ ] 5.2 Migration includes `hasTable` guard so it runs cleanly on fresh schemas where `recipe_cost_history` was never created.

## 6. Tests

- [ ] 6.1 `cost.service.spec.ts`:
  - Replace `RecipeCostHistoryRepository` mock with `AuditLogService` mock.
  - Update `recordSnapshot()` tests to assert envelope shape (with components) instead of recipe_cost_history rows.
  - Update `getHistory()` + `computeCostDelta()` tests to use new audit_log mock.
- [ ] 6.2 `cost.service.int.spec.ts` (Postgres): adapt fixtures + assertions to query audit_log instead of recipe_cost_history. Verify migration 0018 backfill produces correct payload shape.
- [ ] 6.3 `recipes-cost.controller.spec.ts`: assertions on response DTO shape unchanged; mock the service the same way.
- [ ] 6.4 New unit tests for `unpackHistoryRows` covering: rich payload (components), thin Wave 1.9 payload (no components), payload with `null` totalCost, payload with empty components array.

## 7. Verification

- [ ] 7.1 `openspec validate m2-audit-log-cost-history-merge` passes.
- [ ] 7.2 `npx jest --runInBand` (apps/api) — full suite green; ≥10 net new + adapted tests pass.
- [ ] 7.3 Lint clean across workspaces.
- [ ] 7.4 Build green across workspaces.
- [ ] 7.5 No references to `RecipeCostHistory` / `recipe_cost_history` remain in production code (`grep -rn RecipeCostHistory apps/api/src/ -l` returns only the migration files 0011 + 0018 + maybe spec files we didn't touch).

## 8. CI + landing

- [ ] 8.1 Implementation pushed; CI green (Build / Test / Integration / Lint / Storybook / Secrets / rag-* / CodeRabbit).
- [ ] 8.2 Admin-merge once required checks pass.
- [ ] 8.3 Archive `openspec/changes/m2-audit-log-cost-history-merge/` → `openspec/specs/m2-audit-log-cost-history-merge/`.
- [ ] 8.4 Write `retros/m2-audit-log-cost-history-merge.md`.
- [ ] 8.5 Update auto-memory `project_m1_state.md` — Wave 1.10 closed; pivot to Wave 1.11 (FTS).
- [ ] 8.6 File follow-ups:
  - `m2-audit-log-cost-history-pagination` — if a hot recipe exceeds 200 rebuilds in window.
