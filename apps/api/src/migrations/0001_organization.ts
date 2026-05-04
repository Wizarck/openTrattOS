import { MigrationInterface, QueryRunner } from 'typeorm';

// TypeORM 0.3 parses the last 13 chars of the class name as a Unix-ms
// timestamp; the file-prefix `0001_…` is for human ordering only.
export class Organization1700000001000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "organizations" (
        "id"             uuid                       PRIMARY KEY,
        "name"           varchar(200)               NOT NULL,
        "currency_code"  char(3)                    NOT NULL,
        "default_locale" varchar(8)                 NOT NULL,
        "timezone"       varchar(64)                NOT NULL,
        "created_by"     uuid                       NULL,
        "updated_by"     uuid                       NULL,
        "created_at"     timestamptz                NOT NULL DEFAULT now(),
        "updated_at"     timestamptz                NOT NULL DEFAULT now(),
        CONSTRAINT "ck_organizations_currency_iso4217"
          CHECK ("currency_code" ~ '^[A-Z]{3}$'),
        CONSTRAINT "ck_organizations_default_locale_iso6391"
          CHECK ("default_locale" ~ '^[a-z]{2}$'),
        CONSTRAINT "ck_organizations_name_nonblank"
          CHECK (length(trim(both from "name")) > 0),
        CONSTRAINT "ck_organizations_timezone_nonblank"
          CHECK (length(trim(both from "timezone")) > 0)
      )
    `);
    await queryRunner.query(`CREATE INDEX "ix_organizations_name" ON "organizations" ("name")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_organizations_name"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "organizations"`);
  }
}
