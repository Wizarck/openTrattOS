import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * M2 ai-yield-suggestions: single unified `ai_suggestions` table consolidating
 * cache + audit. Per Gate D 3 (proposal accepted) we do NOT split into a
 * separate audit_log table — that ships in a future slice. Each row is both:
 *
 *   1. A cache entry (by `(organization_id, kind, target_*_id, context_hash)`
 *      with `status='pending' AND expires_at > now()`)
 *   2. An audit row (when `status` flips to `'accepted'` / `'rejected'`)
 *
 * Iron rule (FR19): `citation_url` + `snippet` are NOT NULL. The provider
 * never persists a row that fails the iron-rule guard.
 *
 * 30d TTL is enforced via `expires_at = created_at + INTERVAL '30 days'`
 * (set at insertion). Lazy expiration on read; a future cron may compact.
 */
export class AiSuggestions1700000016000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "ai_suggestions" (
        "id" uuid PRIMARY KEY,
        "organization_id" uuid NOT NULL,
        "kind" text NOT NULL,
        "target_ingredient_id" uuid NULL,
        "target_recipe_id" uuid NULL,
        "context_hash" text NOT NULL,
        "suggested_value" numeric(8,4) NOT NULL,
        "citation_url" text NOT NULL,
        "snippet" text NOT NULL,
        "model_name" text NOT NULL,
        "model_version" text NOT NULL,
        "status" text NOT NULL DEFAULT 'pending',
        "accepted_value" numeric(8,4) NULL,
        "rejected_reason" text NULL,
        "acted_by_user_id" uuid NULL,
        "acted_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "expires_at" timestamptz NOT NULL,
        CONSTRAINT "ai_suggestions_kind_check" CHECK ("kind" IN ('yield','waste')),
        CONSTRAINT "ai_suggestions_status_check"
          CHECK ("status" IN ('pending','accepted','rejected')),
        CONSTRAINT "ai_suggestions_target_xor_check"
          CHECK (
            ("kind" = 'yield' AND "target_ingredient_id" IS NOT NULL AND "target_recipe_id" IS NULL)
            OR
            ("kind" = 'waste' AND "target_recipe_id" IS NOT NULL AND "target_ingredient_id" IS NULL)
          ),
        CONSTRAINT "ai_suggestions_snippet_length_check"
          CHECK (char_length("snippet") <= 500),
        CONSTRAINT "ai_suggestions_value_range_check"
          CHECK ("suggested_value" >= 0 AND "suggested_value" <= 1)
      )
    `);

    // Cache lookup index — covers the WHERE clause used by AiSuggestionsService.
    await queryRunner.query(`
      CREATE INDEX "ix_ai_suggestions_cache_lookup"
      ON "ai_suggestions"
      ("organization_id", "kind", "target_ingredient_id", "target_recipe_id", "context_hash", "status", "expires_at")
    `);

    // Audit lookup index — for "what suggestions did user X act on?"
    await queryRunner.query(`
      CREATE INDEX "ix_ai_suggestions_acted_by"
      ON "ai_suggestions"
      ("organization_id", "acted_by_user_id", "acted_at")
      WHERE "acted_by_user_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_ai_suggestions_acted_by"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_ai_suggestions_cache_lookup"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_suggestions"`);
  }
}
