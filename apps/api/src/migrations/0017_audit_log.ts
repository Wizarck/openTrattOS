import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * M2 Wave 1.9 — m2-audit-log: canonical cross-BC audit log.
 *
 * Per Gate D 2d (proposal accepted): create the table AND backfill
 * historical rows from the 4 existing per-BC audit sources in the same
 * transaction. Per-BC audit columns + tables are NOT dropped here — that
 * is deferred to follow-up `m2-audit-log-cleanup`.
 *
 * Schema rationale (ADR-AUDIT-SCHEMA in design.md):
 * - `event_type` text (open enum, app-side validation) — extending the set
 *   in M3+ is zero-migration cost.
 * - `aggregate_type` + `aggregate_id` is a polymorphic FK; no real FK
 *   because aggregates span tables. App-level guarantee: emitter only
 *   fires after the entity exists.
 * - 3 indexes cover the 3 expected access patterns (drill-down, global
 *   filter, user history). The table is write-heavy; more indexes would
 *   slow inserts.
 *
 * Backfill sources (2 of 4 may be empty in fresh deployments):
 * - ai_suggestions rows where status ∈ ('accepted','rejected') → 1:1
 * - recipe_cost_history rows → 1:1 (event_type=RECIPE_COST_REBUILT)
 * - ingredients.overrides jsonb (when non-empty array) → 1:N per entry
 * - recipes.allergens_overrides jsonb → 1:N per entry
 *
 * Known data gap: SUPPLIER_PRICE_UPDATED + RECIPE_INGREDIENT_UPDATED were
 * never persisted; no backfill possible. Going forward they are captured
 * by the AuditLogSubscriber.
 */
export class AuditLog1700000017000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "audit_log" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "event_type" text NOT NULL,
        "aggregate_type" text NOT NULL,
        "aggregate_id" uuid NOT NULL,
        "actor_user_id" uuid NULL,
        "actor_kind" text NOT NULL,
        "agent_name" text NULL,
        "payload_before" jsonb NULL,
        "payload_after" jsonb NULL,
        "reason" text NULL,
        "citation_url" text NULL,
        "snippet" text NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "audit_log_event_type_length_check"
          CHECK (char_length("event_type") BETWEEN 1 AND 100),
        CONSTRAINT "audit_log_aggregate_type_length_check"
          CHECK (char_length("aggregate_type") BETWEEN 1 AND 50),
        CONSTRAINT "audit_log_actor_kind_check"
          CHECK ("actor_kind" IN ('user','agent','system')),
        CONSTRAINT "audit_log_reason_length_check"
          CHECK ("reason" IS NULL OR char_length("reason") <= 2000),
        CONSTRAINT "audit_log_snippet_length_check"
          CHECK ("snippet" IS NULL OR char_length("snippet") <= 500)
      )
    `);

    // Drill-down by aggregate (most-common access pattern).
    await queryRunner.query(`
      CREATE INDEX "ix_audit_log_aggregate"
      ON "audit_log"
      ("organization_id", "aggregate_type", "aggregate_id", "created_at" DESC)
    `);

    // Global filter by event type.
    await queryRunner.query(`
      CREATE INDEX "ix_audit_log_event_type"
      ON "audit_log"
      ("organization_id", "event_type", "created_at" DESC)
    `);

    // Partial index — user-history queries skip rows without an actor.
    await queryRunner.query(`
      CREATE INDEX "ix_audit_log_actor"
      ON "audit_log"
      ("organization_id", "actor_user_id", "created_at" DESC)
      WHERE "actor_user_id" IS NOT NULL
    `);

    await this.backfillFromAiSuggestions(queryRunner);
    await this.backfillFromRecipeCostHistory(queryRunner);
    await this.backfillFromIngredientsOverrides(queryRunner);
    await this.backfillFromRecipesAllergensOverrides(queryRunner);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_audit_log_actor"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_audit_log_event_type"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_audit_log_aggregate"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_log"`);
  }

  private async backfillFromAiSuggestions(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.hasTable('ai_suggestions');
    if (!exists) return;

    // Accepted rows → AI_SUGGESTION_ACCEPTED
    await queryRunner.query(`
      INSERT INTO "audit_log" (
        "organization_id", "event_type", "aggregate_type", "aggregate_id",
        "actor_user_id", "actor_kind",
        "payload_after", "citation_url", "snippet", "created_at"
      )
      SELECT
        "organization_id",
        'AI_SUGGESTION_ACCEPTED',
        'ai_suggestion',
        "id",
        "acted_by_user_id",
        CASE WHEN "acted_by_user_id" IS NULL THEN 'system' ELSE 'user' END,
        jsonb_build_object(
          'status', "status",
          'suggestedValue', "suggested_value",
          'acceptedValue', "accepted_value",
          'modelName', "model_name",
          'modelVersion', "model_version"
        ),
        "citation_url",
        "snippet",
        COALESCE("acted_at", "created_at")
      FROM "ai_suggestions"
      WHERE "status" = 'accepted'
    `);

    // Rejected rows → AI_SUGGESTION_REJECTED
    await queryRunner.query(`
      INSERT INTO "audit_log" (
        "organization_id", "event_type", "aggregate_type", "aggregate_id",
        "actor_user_id", "actor_kind",
        "payload_after", "reason", "citation_url", "snippet", "created_at"
      )
      SELECT
        "organization_id",
        'AI_SUGGESTION_REJECTED',
        'ai_suggestion',
        "id",
        "acted_by_user_id",
        CASE WHEN "acted_by_user_id" IS NULL THEN 'system' ELSE 'user' END,
        jsonb_build_object(
          'status', "status",
          'suggestedValue', "suggested_value",
          'modelName', "model_name",
          'modelVersion', "model_version"
        ),
        "rejected_reason",
        "citation_url",
        "snippet",
        COALESCE("acted_at", "created_at")
      FROM "ai_suggestions"
      WHERE "status" = 'rejected'
    `);
  }

  private async backfillFromRecipeCostHistory(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.hasTable('recipe_cost_history');
    if (!exists) return;

    // recipe_cost_history uses `computed_at`, not `created_at` (per migration 0011).
    await queryRunner.query(`
      INSERT INTO "audit_log" (
        "organization_id", "event_type", "aggregate_type", "aggregate_id",
        "actor_kind",
        "payload_after", "created_at"
      )
      SELECT
        rch."organization_id",
        'RECIPE_COST_REBUILT',
        'recipe',
        rch."recipe_id",
        'system',
        to_jsonb(rch.*) - 'organization_id' - 'recipe_id',
        rch."computed_at"
      FROM "recipe_cost_history" rch
    `);
  }

  private async backfillFromIngredientsOverrides(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.hasTable('ingredients');
    if (!exists) return;
    const hasColumn = await queryRunner.hasColumn('ingredients', 'overrides');
    if (!hasColumn) return;

    // Per migration 0014, `overrides` is a jsonb object keyed by field name
    // (allergens / dietFlags / nutrition / brandName). Each value is
    // `{value, reason, appliedBy, appliedAt}`. Backfill produces one row per
    // top-level field, with `actor_user_id` recovered from `appliedBy` when
    // present.
    await queryRunner.query(`
      INSERT INTO "audit_log" (
        "organization_id", "event_type", "aggregate_type", "aggregate_id",
        "actor_user_id", "actor_kind",
        "payload_after", "reason", "created_at"
      )
      SELECT
        i."organization_id",
        'INGREDIENT_OVERRIDE_CHANGED',
        'ingredient',
        i."id",
        CASE
          WHEN kv.value ? 'appliedBy' AND jsonb_typeof(kv.value->'appliedBy') = 'string'
            THEN (kv.value->>'appliedBy')::uuid
          ELSE NULL
        END,
        CASE
          WHEN kv.value ? 'appliedBy' AND jsonb_typeof(kv.value->'appliedBy') = 'string'
            THEN 'user'
          ELSE 'system'
        END,
        jsonb_build_object('field', kv.key, 'value', kv.value),
        kv.value->>'reason',
        COALESCE(
          NULLIF(kv.value->>'appliedAt', '')::timestamptz,
          i."updated_at",
          i."created_at",
          now()
        )
      FROM "ingredients" i,
           LATERAL jsonb_each(i."overrides") kv
      WHERE jsonb_typeof(i."overrides") = 'object'
        AND i."overrides" != '{}'::jsonb
    `);
  }

  private async backfillFromRecipesAllergensOverrides(
    queryRunner: QueryRunner,
  ): Promise<void> {
    const exists = await queryRunner.hasTable('recipes');
    if (!exists) return;
    const hasColumn = await queryRunner.hasColumn('recipes', 'allergens_overrides');
    if (!hasColumn) return;

    await queryRunner.query(`
      INSERT INTO "audit_log" (
        "organization_id", "event_type", "aggregate_type", "aggregate_id",
        "actor_kind",
        "payload_after", "created_at"
      )
      SELECT
        r."organization_id",
        'RECIPE_ALLERGENS_OVERRIDE_CHANGED',
        'recipe',
        r."id",
        'system',
        CASE
          WHEN jsonb_typeof(r."allergens_overrides") = 'object' THEN r."allergens_overrides"
          ELSE jsonb_build_object('value', r."allergens_overrides")
        END,
        COALESCE(r."updated_at", r."created_at", now())
      FROM "recipes" r
      WHERE r."allergens_overrides" IS NOT NULL
        AND jsonb_typeof(r."allergens_overrides") IN ('object', 'array')
        AND r."allergens_overrides" != '{}'::jsonb
        AND r."allergens_overrides" != '[]'::jsonb
    `);
  }
}
