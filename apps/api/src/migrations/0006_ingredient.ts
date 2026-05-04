import { MigrationInterface, QueryRunner } from 'typeorm';

export class Ingredient1700000006000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "ingredients" (
        "id"              uuid                       PRIMARY KEY,
        "organization_id" uuid                       NOT NULL,
        "category_id"     uuid                       NOT NULL,
        "name"            varchar(200)               NOT NULL,
        "internal_code"   varchar(64)                NOT NULL,
        "base_unit_type"  varchar(16)                NOT NULL,
        "density_factor"  double precision           NULL,
        "notes"           text                       NULL,
        "is_active"       boolean                    NOT NULL DEFAULT true,
        "created_by"      uuid                       NULL,
        "updated_by"      uuid                       NULL,
        "created_at"      timestamptz                NOT NULL DEFAULT now(),
        "updated_at"      timestamptz                NOT NULL DEFAULT now(),
        CONSTRAINT "fk_ingredients_organization"
          FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_ingredients_category"
          FOREIGN KEY ("category_id") REFERENCES "categories" ("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_ingredients_created_by"
          FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE SET NULL,
        CONSTRAINT "fk_ingredients_updated_by"
          FOREIGN KEY ("updated_by") REFERENCES "users" ("id") ON DELETE SET NULL,
        CONSTRAINT "ck_ingredients_base_unit_type_enum"
          CHECK ("base_unit_type" IN ('WEIGHT', 'VOLUME', 'UNIT')),
        CONSTRAINT "ck_ingredients_density_unit_forbidden"
          CHECK ("base_unit_type" <> 'UNIT' OR "density_factor" IS NULL),
        CONSTRAINT "ck_ingredients_density_positive"
          CHECK ("density_factor" IS NULL OR "density_factor" > 0),
        CONSTRAINT "ck_ingredients_name_nonblank"
          CHECK (length(trim(both from "name")) > 0),
        CONSTRAINT "ck_ingredients_internal_code_nonblank"
          CHECK (length(trim(both from "internal_code")) > 0)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_ingredients_org_internal_code"
        ON "ingredients" ("organization_id", "internal_code")
    `);
    await queryRunner.query(
      `CREATE INDEX "ix_ingredients_organization_id" ON "ingredients" ("organization_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_ingredients_category_id" ON "ingredients" ("category_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_ingredients_is_active" ON "ingredients" ("is_active") WHERE "is_active" = true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_ingredients_is_active"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_ingredients_category_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_ingredients_organization_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_ingredients_org_internal_code"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ingredients"`);
  }
}
