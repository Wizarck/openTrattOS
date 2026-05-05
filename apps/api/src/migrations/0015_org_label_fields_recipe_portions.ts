import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * M2 labels-rendering migration:
 *
 *   1. `organizations.label_fields` (jsonb, NOT NULL DEFAULT '{}'::jsonb)
 *      Stores org-level label config:
 *        {
 *          businessName?:    string,
 *          contactInfo?:     { email?, phone? },
 *          postalAddress?:   { street, city, postalCode, country },
 *          brandMarkUrl?:    string,
 *          pageSize?:        'a4' | 'thermal-4x6' | 'thermal-50x80',
 *          printAdapter?:    { id: string, config: object }
 *        }
 *      Single jsonb matches the override convention used in #7/#13/#15.
 *
 *   2. `recipes.portions` (int, NOT NULL DEFAULT 1, CHECK >= 1)
 *      Number of portions a Recipe yields. Used by the label renderer to
 *      derive "net quantity per portion" from the total walked tree mass.
 */
export class OrgLabelFieldsRecipePortions1700000015000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "organizations"
        ADD COLUMN "label_fields" jsonb NOT NULL DEFAULT '{}'::jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "recipes"
        ADD COLUMN "portions" integer NOT NULL DEFAULT 1`,
    );
    await queryRunner.query(
      `ALTER TABLE "recipes"
        ADD CONSTRAINT "recipes_portions_min_check" CHECK ("portions" >= 1)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "recipes" DROP CONSTRAINT IF EXISTS "recipes_portions_min_check"`,
    );
    await queryRunner.query(`ALTER TABLE "recipes" DROP COLUMN IF EXISTS "portions"`);
    await queryRunner.query(`ALTER TABLE "organizations" DROP COLUMN IF EXISTS "label_fields"`);
  }
}
