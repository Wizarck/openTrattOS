import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * M2 ingredients-extension: jsonb `overrides` column on Ingredients.
 *
 * Per design.md Open Question 1 = (a): a single jsonb column carries any
 * Manager+ field-level overrides. Shape:
 *   {
 *     allergens?:   { value: string[], reason, appliedBy, appliedAt },
 *     dietFlags?:   { value: string[], reason, appliedBy, appliedAt },
 *     nutrition?:   { value: jsonb,    reason, appliedBy, appliedAt },
 *     brandName?:   { value: string,   reason, appliedBy, appliedAt }
 *   }
 *
 * Default `'{}'::jsonb` so existing rows behave identically until the chef
 * applies an override. Audit trail lives in the future audit_log table; for
 * now, INGREDIENT_OVERRIDE_CHANGED events carry the attribution payload.
 */
export class IngredientsOverridesColumn1700000014000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ingredients"
        ADD COLUMN "overrides" jsonb NOT NULL DEFAULT '{}'::jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "ingredients" DROP COLUMN IF EXISTS "overrides"`);
  }
}
