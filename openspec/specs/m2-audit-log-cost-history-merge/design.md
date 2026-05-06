## Context

`m2-cost-rollup-and-audit` (PR #75) shipped `recipe_cost_history` with the shape:

```sql
CREATE TABLE recipe_cost_history (
  id, recipe_id, organization_id,
  component_ref_id   uuid NULL,            -- RecipeIngredient.id, NULL for totals row
  cost_per_base_unit numeric(14,4),
  total_cost         numeric(14,4),
  source_ref_id      uuid NULL,            -- SupplierItem.id (M2) / Batch.id (M3)
  reason             varchar(32),          -- INITIAL / SUPPLIER_PRICE_CHANGE / ...
  computed_at        timestamptz
);
```

Each `cost.service.recordSnapshot()` call writes N+1 rows: one per RecipeIngredient component (with `component_ref_id`) plus one totals row (`component_ref_id = NULL`, `total_cost = breakdown.totalCost`). All rows share the same `computed_at`.

`m2-audit-log` (Wave 1.9, PR #90) added a separate audit_log row per rebuild with `payload_after = {reason, totalCost, componentCount}` — sufficient for "did a rebuild happen?" but missing the per-component data needed by `/cost-delta` (Journey 2).

This slice consolidates onto audit_log: enrich the payload to carry the components array, migrate the two read-paths, drop `recipe_cost_history`.

## Goals / Non-Goals

**Goals:**

- One audit_log row per rebuild (atomic per-event; `payload_after.components` carries the breakdown).
- `/cost-history` + `/cost-delta` endpoints read from audit_log; client wire format unchanged.
- Backfill `recipe_cost_history` rows into audit_log with the new shape (one audit row per `(recipe_id, computed_at)` group).
- `recipe_cost_history` table + entity + repository removed in same migration.
- Rollback path: reverse migration recreates `recipe_cost_history` from audit_log.

**Non-Goals:**

- Change the client-facing `CostHistoryRowDto` / `CostDeltaDto` shape. The migration is internal.
- Touch other audit-shaped columns (override jsonb / ai_suggestions cache fields) — those hold current state, not history.
- FTS / export / retention follow-ups.

## Decisions

### ADR-COST-PAYLOAD — single envelope per rebuild with components array

```ts
interface RecipeCostRebuiltPayload {
  reason: 'INITIAL' | 'SUPPLIER_PRICE_CHANGE' | 'LINE_EDIT' | 'SUB_RECIPE_CHANGE' | 'SOURCE_OVERRIDE' | 'MANUAL_RECOMPUTE';
  totalCost: number;
  components: Array<{
    recipeIngredientId: string;
    costPerBaseUnit: number;
    totalCost: number;        // line cost
    sourceRefId: string | null;
  }>;
}
```

**Rationale:** atomic per rebuild — one audit_log row captures everything that happened in one snapshot. Row count drops ~21× (N+1 rows → 1 row for a 20-component recipe). Jsonb is cheap; query plan is unchanged. The alternative (one row per component, mirroring the legacy shape) bloats audit_log and loses the rebuild's atomic identity.

**Trade-off:** payload size grows from ~200 B to ~3-5 KB for typical recipes. Still well within Postgres jsonb performance envelope; toast compression kicks in at 8 KB. Even a 100-component pathological recipe stays under 10 KB.

### ADR-COST-BACKFILL — single migration with `array_agg` reconstruction

Backfill SQL groups existing `recipe_cost_history` rows by `(recipe_id, computed_at)`, reconstructs the new payload shape via `jsonb_build_object`, inserts one audit_log row per group, then drops the legacy table — all in one transaction.

```sql
INSERT INTO audit_log (
  organization_id, event_type, aggregate_type, aggregate_id,
  actor_kind, payload_after, created_at
)
SELECT
  rch.organization_id,
  'RECIPE_COST_REBUILT',
  'recipe',
  rch.recipe_id,
  'system',
  jsonb_build_object(
    'reason',     MAX(rch.reason),
    'totalCost',  MAX(rch.total_cost) FILTER (WHERE rch.component_ref_id IS NULL),
    'components', COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'recipeIngredientId', rch.component_ref_id,
          'costPerBaseUnit',    rch.cost_per_base_unit,
          'totalCost',          rch.total_cost,
          'sourceRefId',        rch.source_ref_id
        ) ORDER BY rch.id
      ) FILTER (WHERE rch.component_ref_id IS NOT NULL),
      '[]'::jsonb
    )
  ),
  rch.computed_at
FROM recipe_cost_history rch
GROUP BY rch.organization_id, rch.recipe_id, rch.computed_at;

DROP INDEX IF EXISTS ix_recipe_cost_history_recipe_computed;
DROP INDEX IF EXISTS ix_recipe_cost_history_organization;
DROP TABLE IF EXISTS recipe_cost_history;
```

**Rationale:** atomic cutover. Once the migration commits, `recipe_cost_history` is gone and audit_log carries every historical rebuild in the new shape. No transitional double-write; no drift risk.

**Down-migration**: recreates `recipe_cost_history` (same schema as 0011) + reverse-aggregates audit_log RECIPE_COST_REBUILT rows: each row's `payload_after.components[]` becomes N component rows; the row's `payload_after.totalCost` becomes the totals row (`component_ref_id = NULL`); the audit_log rows are then deleted (so re-running up doesn't double-insert). Symmetric.

### ADR-COST-READ-MIGRATION — query audit_log + unpack

`getHistory(orgId, recipeId, windowDays)` becomes:

```ts
const page = await this.auditLog.query({
  organizationId: orgId,
  aggregateType: 'recipe',
  aggregateId: recipeId,
  eventTypes: ['RECIPE_COST_REBUILT'],
  since, until,
  limit: AUDIT_LOG_MAX_LIMIT,  // unbounded for the window — acceptable for 14d
});
return page.rows.flatMap(unpackHistoryRows);  // each row produces 1 totals + N component rows
```

`computeCostDelta(orgId, recipeId, from, to)` does the same query with `since=new Date(0)`, `until=to`, then walks the unpacked rows building two snapshots. The downstream component-name resolution (RecipeIngredient → Ingredient/Recipe joins) is unchanged.

**Rationale:** both endpoints share the same audit_log query + unpack helper. No new SQL beyond what AuditLogService already supports. The `AUDIT_LOG_MAX_LIMIT=200` cap is sufficient: 14d × ~10 rebuilds/day = 140 rebuilds, each = 1 row.

**Edge case:** the existing `getCostDelta()` semantics are "latest row at-or-before each boundary". Mapped onto audit_log: since one row per rebuild now, the snapshot is just `payload_after` of the latest row at-or-before the boundary. Cleaner than the previous "latest among multiple rows sharing computed_at" logic.

### ADR-COST-DTO-MAP — `fromAuditUnpack` replaces `fromEntity`

`CostHistoryRowDto.fromEntity(RecipeCostHistory)` is deleted; replaced by `CostHistoryRowDto.fromAuditUnpack(unpacked)`. The wire shape stays identical:

```ts
{ id, recipeId, componentRefId, costPerBaseUnit, totalCost, sourceRefId, reason, computedAt }
```

`id` was the `recipe_cost_history.id` UUID; after the migration, since one audit_log row produces N+1 wire-DTO rows (totals + components), the synthetic id is `<auditLogRowId>:<componentRefId or 'totals'>` — stable, idempotent, lets the frontend dedupe + key React lists. **Deviation from "no client-facing change"**: the `id` field's format changes from a UUID to `<uuid>:<segment>`. Frontend treats `id` as opaque so this is acceptable; documented as a client-visible quirk in the retro.

## Risks / Trade-offs

- **[Risk] Backfill SQL produces a `'totals'` row missing when a recipe had only component rows** (data corruption from an earlier slice). **Mitigation**: `jsonb_build_object` returns `null` for the missing `totalCost`; the migration test ensures the synthesized payload still has a finite `totalCost` by falling back to `SUM(total_cost)` over component rows when no totals row exists.
- **[Risk] `id` field change** in `CostHistoryRowDto` from UUID to `<uuid>:<segment>`. **Mitigation**: opaque to the frontend; no UI uses it for routing or persistence. Documented as a known quirk in retro.
- **[Risk] AUDIT_LOG_MAX_LIMIT=200 caps `/cost-history`** at 200 rebuilds in window. **Mitigation**: 14d × 10 rebuilds/day = 140 → comfortable. If a hot recipe rebuilds >200 times in 14d, we add pagination; filed as follow-up.
- **[Trade-off] Backfill is destructive** — once the migration runs, `recipe_cost_history` is gone. Down-migration is symmetric but a real DBA mistake (running down on a corrupted audit_log) loses data. **Mitigation**: standard pre-migration backup + validation step in the operator runbook.
- **[Trade-off] Wave 1.9 backfilled audit_log rows have the thin payload** (`{reason, totalCost, componentCount}`). After this slice's backfill: those Wave 1.9 rows still exist alongside the new richer ones. **Mitigation**: `unpackHistoryRows()` detects the thin shape (no `components` array) and synthesizes a single totals row + zero component rows for it. Documented as known data gap; the new path captures everything going forward.

## Migration Plan

1. Update `cost.service.recordSnapshot()` to emit the new payload shape (components array). Drop the `recipe_cost_history` writes in the same change.
2. Update `cost.service.getHistory()` + `computeCostDelta()` to query audit_log via `AuditLogService` (now injected as a dependency) and unpack via a new helper.
3. Add `unpackHistoryRows(auditRow): CostHistoryUnpacked[]` helper — handles thin (Wave 1.9) + new (Wave 1.10) shapes.
4. Update DTOs (`CostHistoryRowDto.fromAuditUnpack`).
5. Update `cost.module.ts` — remove `RecipeCostHistory` entity, drop the `RecipeCostHistoryRepository` provider; inject `AuditLogModule`.
6. Delete `recipe-cost-history.entity.ts` + `recipe-cost-history.repository.ts`.
7. Migration `0018_drop_recipe_cost_history.ts` — backfill + drop in one transaction.
8. Update specs (cost.service.spec.ts, cost.service.int.spec.ts, recipes-cost.controller.spec.ts).
9. Verify: openspec validate; full apps/api suite green; lint + build clean.

**Rollback**: down-migration recreates `recipe_cost_history`, reverse-aggregates audit_log RECIPE_COST_REBUILT rows into the legacy schema, deletes those audit_log rows. Then revert this slice's commits to restore the entity + repository + cost.service old code paths.

## Open Questions

- **Should `unpackHistoryRows` deduplicate by `<componentRefId>`?** Decision: no. The endpoint is "history" — multiple snapshots returning the same component is correct semantics (Journey 2 wants to see the change). Frontend rendering already handles repeated component rows.
- **Should we add a `RECIPE_COST_REBUILT_V2` event type to differentiate post-this-slice from pre-this-slice payloads?** Decision: no — `payload_after.components` presence is the discriminator. Keeping one event type avoids namespace bloat. Documented in the unpack helper.
- **What about future RecipeCostHistory consumers** (e.g. an analytics export)? Decision: they migrate to audit_log queries via the same `AuditLogService.query` API; the DTO mapping helper is exported.
