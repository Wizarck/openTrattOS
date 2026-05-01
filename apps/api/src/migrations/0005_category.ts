import { MigrationInterface, QueryRunner } from 'typeorm';

export class Category0005 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "categories" (
        "id"              uuid                       PRIMARY KEY,
        "organization_id" uuid                       NOT NULL,
        "parent_id"       uuid                       NULL,
        "name"            varchar(100)               NOT NULL,
        "name_es"         varchar(200)               NOT NULL,
        "name_en"         varchar(200)               NOT NULL,
        "sort_order"      integer                    NOT NULL DEFAULT 0,
        "is_default"      boolean                    NOT NULL DEFAULT false,
        "created_by"      uuid                       NULL,
        "updated_by"      uuid                       NULL,
        "created_at"      timestamptz                NOT NULL DEFAULT now(),
        "updated_at"      timestamptz                NOT NULL DEFAULT now(),
        CONSTRAINT "fk_categories_organization"
          FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_categories_parent"
          FOREIGN KEY ("parent_id") REFERENCES "categories" ("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_categories_created_by"
          FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE SET NULL,
        CONSTRAINT "fk_categories_updated_by"
          FOREIGN KEY ("updated_by") REFERENCES "users" ("id") ON DELETE SET NULL,
        CONSTRAINT "ck_categories_no_self_parent"
          CHECK ("parent_id" IS NULL OR "parent_id" <> "id"),
        CONSTRAINT "ck_categories_sort_order_non_negative"
          CHECK ("sort_order" >= 0),
        CONSTRAINT "ck_categories_name_nonblank"
          CHECK (length(trim(both from "name")) > 0)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_categories_org_parent_name"
        ON "categories" ("organization_id", COALESCE("parent_id", '00000000-0000-0000-0000-000000000000'::uuid), "name")
    `);
    await queryRunner.query(
      `CREATE INDEX "ix_categories_organization_id" ON "categories" ("organization_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_categories_parent_id" ON "categories" ("parent_id") WHERE "parent_id" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_categories_parent_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_categories_organization_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_categories_org_parent_name"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "categories"`);
  }
}
