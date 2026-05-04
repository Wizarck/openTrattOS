import { MigrationInterface, QueryRunner } from 'typeorm';

export class User1700000002000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id"              uuid                       PRIMARY KEY,
        "organization_id" uuid                       NOT NULL,
        "name"            varchar(200)               NOT NULL,
        "email"           varchar(320)               NOT NULL,
        "password_hash"   varchar(60)                NOT NULL,
        "role"            varchar(16)                NOT NULL,
        "is_active"       boolean                    NOT NULL DEFAULT true,
        "created_by"      uuid                       NULL,
        "updated_by"      uuid                       NULL,
        "created_at"      timestamptz                NOT NULL DEFAULT now(),
        "updated_at"      timestamptz                NOT NULL DEFAULT now(),
        CONSTRAINT "fk_users_organization"
          FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_users_created_by"
          FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE SET NULL,
        CONSTRAINT "fk_users_updated_by"
          FOREIGN KEY ("updated_by") REFERENCES "users" ("id") ON DELETE SET NULL,
        CONSTRAINT "ck_users_role_enum"
          CHECK ("role" IN ('OWNER', 'MANAGER', 'STAFF')),
        CONSTRAINT "ck_users_email_lowercase"
          CHECK ("email" = lower("email")),
        CONSTRAINT "ck_users_password_hash_bcrypt"
          CHECK ("password_hash" ~ '^\\$2[aby]\\$\\d{2}\\$[./A-Za-z0-9]{53}$'),
        CONSTRAINT "ck_users_name_nonblank"
          CHECK (length(trim(both from "name")) > 0)
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_users_org_email" ON "users" ("organization_id", "email")
    `);
    await queryRunner.query(`
      CREATE INDEX "ix_users_organization_id" ON "users" ("organization_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_users_organization_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_users_org_email"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
  }
}
