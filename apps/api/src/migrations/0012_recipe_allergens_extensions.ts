import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * M2 m2-allergens-article-21 — Article 21 allergen aggregation, diet flag
 * inference, Manager+ override, cross-contamination notes.
 *
 * Aggregation itself is read-time per design.md (never stored on Recipe). The
 * four columns added here carry only override + cross-contamination state:
 *
 *   - aggregated_allergens_override : jsonb NULL  — Manager+ override
 *       payload `{add, remove, reason, appliedBy, appliedAt}`.
 *   - diet_flags_override           : jsonb NULL  — Manager+ override
 *       payload `{flags, reason, appliedBy, appliedAt}`.
 *   - cross_contamination_note      : text NULL   — free-text "may contain
 *       traces of X" written by Manager+; nullable until set.
 *   - cross_contamination_allergens : text[] NOT NULL DEFAULT '{}' —
 *       structured tag list backing the free-text note. Validation rejects
 *       free text without structured tagging.
 *
 * Purely additive ALTER. Down-migration drops the four columns; no existing
 * data is touched.
 */
export class RecipeAllergensExtensions1700000012000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "recipes"
        ADD COLUMN "aggregated_allergens_override" jsonb  NULL,
        ADD COLUMN "diet_flags_override"           jsonb  NULL,
        ADD COLUMN "cross_contamination_note"      text   NULL,
        ADD COLUMN "cross_contamination_allergens" text[] NOT NULL DEFAULT '{}'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "recipes"
        DROP COLUMN IF EXISTS "cross_contamination_allergens",
        DROP COLUMN IF EXISTS "cross_contamination_note",
        DROP COLUMN IF EXISTS "diet_flags_override",
        DROP COLUMN IF EXISTS "aggregated_allergens_override"
    `);
  }
}
