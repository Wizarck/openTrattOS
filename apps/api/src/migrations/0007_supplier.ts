import { MigrationInterface, QueryRunner } from 'typeorm';

export class Supplier0007 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "suppliers" (
        "id"              uuid                       PRIMARY KEY,
        "organization_id" uuid                       NOT NULL,
        "name"            varchar(200)               NOT NULL,
        "contact_name"    varchar(200)               NULL,
        "email"           varchar(320)               NULL,
        "phone"           varchar(32)                NULL,
        "country"         char(2)                    NOT NULL,
        "is_active"       boolean                    NOT NULL DEFAULT true,
        "created_by"      uuid                       NULL,
        "updated_by"      uuid                       NULL,
        "created_at"      timestamptz                NOT NULL DEFAULT now(),
        "updated_at"      timestamptz                NOT NULL DEFAULT now(),
        CONSTRAINT "fk_suppliers_organization"
          FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_suppliers_created_by"
          FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE SET NULL,
        CONSTRAINT "fk_suppliers_updated_by"
          FOREIGN KEY ("updated_by") REFERENCES "users" ("id") ON DELETE SET NULL,
        CONSTRAINT "ck_suppliers_country_iso3166_a2"
          CHECK ("country" ~ '^[A-Z]{2}$'),
        CONSTRAINT "ck_suppliers_email_lowercase"
          CHECK ("email" IS NULL OR "email" = lower("email")),
        CONSTRAINT "ck_suppliers_name_nonblank"
          CHECK (length(trim(both from "name")) > 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "ix_suppliers_organization_id" ON "suppliers" ("organization_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_suppliers_organization_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "suppliers"`);
  }
}
