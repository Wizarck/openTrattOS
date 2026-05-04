import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * M2 cost-rollup-and-audit: per-recipe cost history.
 *
 * Append-only table capturing every cost-affecting event (initial computation,
 * supplier price change, line edit, sub-recipe cascade, source override). The
 * primary read pattern is "last 14 days for recipe X" — covered by the
 * `(recipe_id, computed_at DESC)` index.
 *
 * Per design.md §3 + ADR-016: 4-decimal internal precision, UTC timestamps,
 * additive rollback (history rows survive a slice rollback because they are
 * read-only audit trail). No FK to `recipe_ingredients` because line edits
 * delete + recreate (composite identity), so we keep `component_ref_id` as a
 * loose UUID with no FK constraint — matches how `source_ref_id` will work
 * when M3 batches replace SupplierItem.
 */
export class RecipeCostHistory0011 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_recipe_cost_history_organization"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_recipe_cost_history_recipe_computed"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "recipe_cost_history"`);
  }
}
