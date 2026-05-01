import { MigrationInterface, QueryRunner } from 'typeorm';

export class Location0003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "locations" (
        "id"              uuid                       PRIMARY KEY,
        "organization_id" uuid                       NOT NULL,
        "name"            varchar(200)               NOT NULL,
        "address"         varchar(500)               NOT NULL DEFAULT '',
        "type"            varchar(32)                NOT NULL,
        "is_active"       boolean                    NOT NULL DEFAULT true,
        "created_by"      uuid                       NULL,
        "updated_by"      uuid                       NULL,
        "created_at"      timestamptz                NOT NULL DEFAULT now(),
        "updated_at"      timestamptz                NOT NULL DEFAULT now(),
        CONSTRAINT "fk_locations_organization"
          FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_locations_created_by"
          FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE SET NULL,
        CONSTRAINT "fk_locations_updated_by"
          FOREIGN KEY ("updated_by") REFERENCES "users" ("id") ON DELETE SET NULL,
        CONSTRAINT "ck_locations_type_enum"
          CHECK ("type" IN ('RESTAURANT', 'BAR', 'DARK_KITCHEN', 'CATERING', 'CENTRAL_PRODUCTION')),
        CONSTRAINT "ck_locations_name_nonblank"
          CHECK (length(trim(both from "name")) > 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "ix_locations_organization_id" ON "locations" ("organization_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_locations_organization_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "locations"`);
  }
}
