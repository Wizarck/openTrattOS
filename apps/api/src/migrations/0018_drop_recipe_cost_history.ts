import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * M2 Wave 1.10 — m2-audit-log-cost-history-merge: backfill `recipe_cost_history`
 * rows into `audit_log` with the new richer payload shape (per ADR-COST-PAYLOAD)
 * and DROP the legacy table in the same transaction.
 *
 * Backfill grouping: rows of `recipe_cost_history` sharing the same
 * `(organization_id, recipe_id, computed_at)` tuple were written by ONE
 * `cost.service.recordSnapshot()` call. We aggregate them per group via
 * `array_agg` + `jsonb_build_object` so each rebuild produces ONE
 * `audit_log` row whose `payload_after.components[]` mirrors the legacy
 * per-component breakdown.
 *
 * The totals row of the legacy schema (`component_ref_id IS NULL`) carries
 * the rebuild's `total_cost`; the per-component rows carry the breakdown.
 * If a group is missing the totals row (data corruption from an earlier
 * slice), we fall back to `SUM(total_cost) FILTER (component_ref_id IS NOT NULL)`
 * so the audit row always has a finite `totalCost`.
 *
 * `hasTable` guard so the migration runs cleanly on fresh schemas where
 * recipe_cost_history was never created.
 *
 * Down-migration recreates the legacy schema + reverse-aggregates audit_log
 * rows into N+1 legacy rows + deletes the audit rows so a subsequent up
 * does not double-insert.
 */
export class DropRecipeCostHistory1700000018000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.hasTable('recipe_cost_history');
    if (!exists) {
      return;
    }

    await queryRunner.query(`
      INSERT INTO "audit_log" (
        "organization_id", "event_type", "aggregate_type", "aggregate_id",
        "actor_kind", "payload_after", "created_at"
      )
      SELECT
        rch."organization_id",
        'RECIPE_COST_REBUILT',
        'recipe',
        rch."recipe_id",
        'system',
        jsonb_build_object(
          'reason', MAX(rch."reason"),
          'totalCost', COALESCE(
            MAX(rch."total_cost") FILTER (WHERE rch."component_ref_id" IS NULL),
            SUM(rch."total_cost") FILTER (WHERE rch."component_ref_id" IS NOT NULL),
            0
          ),
          'components', COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'recipeIngredientId', rch."component_ref_id",
                'costPerBaseUnit',    rch."cost_per_base_unit",
                'totalCost',          rch."total_cost",
                'sourceRefId',        rch."source_ref_id"
              ) ORDER BY rch."id"
            ) FILTER (WHERE rch."component_ref_id" IS NOT NULL),
            '[]'::jsonb
          )
        ),
        rch."computed_at"
      FROM "recipe_cost_history" rch
      GROUP BY rch."organization_id", rch."recipe_id", rch."computed_at"
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS "ix_recipe_cost_history_organization"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_recipe_cost_history_recipe_computed"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "recipe_cost_history"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Recreate the legacy schema (matches migration 0011_recipe_cost_history.ts).
    await queryRunner.query(`
      CREATE TABLE "recipe_cost_history" (
        "id"                  uuid          PRIMARY KEY,
        "recipe_id"           uuid          NOT NULL,
        "organization_id"     uuid          NOT NULL,
        "component_ref_id"    uuid          NULL,
        "cost_per_base_unit"  numeric(14,4) NOT NULL,
        "total_cost"          numeric(14,4) NOT NULL,
        "source_ref_id"       uuid          NULL,
        "reason"              varchar(32)   NOT NULL,
        "computed_at"         timestamptz   NOT NULL DEFAULT now(),
        CONSTRAINT "fk_recipe_cost_history_recipe"
          FOREIGN KEY ("recipe_id") REFERENCES "recipes" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_recipe_cost_history_organization"
          FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id") ON DELETE CASCADE,
        CONSTRAINT "ck_recipe_cost_history_reason_enum"
          CHECK ("reason" IN ('INITIAL', 'SUPPLIER_PRICE_CHANGE', 'LINE_EDIT', 'SUB_RECIPE_CHANGE', 'SOURCE_OVERRIDE', 'MANUAL_RECOMPUTE')),
        CONSTRAINT "ck_recipe_cost_history_costs_nonneg"
          CHECK ("cost_per_base_unit" >= 0 AND "total_cost" >= 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "ix_recipe_cost_history_recipe_computed" ON "recipe_cost_history" ("recipe_id", "computed_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_recipe_cost_history_organization" ON "recipe_cost_history" ("organization_id")`,
    );

    // Reverse-aggregate: each audit_log RECIPE_COST_REBUILT row → 1 totals + N component rows.
    await queryRunner.query(`
      INSERT INTO "recipe_cost_history" (
        "id", "recipe_id", "organization_id", "component_ref_id",
        "cost_per_base_unit", "total_cost", "source_ref_id",
        "reason", "computed_at"
      )
      SELECT
        gen_random_uuid(),
        a."aggregate_id",
        a."organization_id",
        NULL,
        0,
        COALESCE((a."payload_after"->>'totalCost')::numeric, 0),
        NULL,
        COALESCE(a."payload_after"->>'reason', 'INITIAL'),
        a."created_at"
      FROM "audit_log" a
      WHERE a."event_type" = 'RECIPE_COST_REBUILT'
        AND a."aggregate_type" = 'recipe'
    `);

    await queryRunner.query(`
      INSERT INTO "recipe_cost_history" (
        "id", "recipe_id", "organization_id", "component_ref_id",
        "cost_per_base_unit", "total_cost", "source_ref_id",
        "reason", "computed_at"
      )
      SELECT
        gen_random_uuid(),
        a."aggregate_id",
        a."organization_id",
        (comp->>'recipeIngredientId')::uuid,
        COALESCE((comp->>'costPerBaseUnit')::numeric, 0),
        COALESCE((comp->>'totalCost')::numeric, 0),
        NULLIF(comp->>'sourceRefId', '')::uuid,
        COALESCE(a."payload_after"->>'reason', 'INITIAL'),
        a."created_at"
      FROM "audit_log" a,
           LATERAL jsonb_array_elements(
             COALESCE(a."payload_after"->'components', '[]'::jsonb)
           ) comp
      WHERE a."event_type" = 'RECIPE_COST_REBUILT'
        AND a."aggregate_type" = 'recipe'
        AND comp->>'recipeIngredientId' IS NOT NULL
    `);

    await queryRunner.query(`
      DELETE FROM "audit_log"
      WHERE "event_type" = 'RECIPE_COST_REBUILT'
        AND "aggregate_type" = 'recipe'
    `);
  }
}
