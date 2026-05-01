import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserLocation0004 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "user_locations" (
        "id"          uuid                       PRIMARY KEY,
        "user_id"     uuid                       NOT NULL,
        "location_id" uuid                       NOT NULL,
        "created_by"  uuid                       NULL,
        "created_at"  timestamptz                NOT NULL DEFAULT now(),
        CONSTRAINT "fk_user_locations_user"
          FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_user_locations_location"
          FOREIGN KEY ("location_id") REFERENCES "locations" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_user_locations_created_by"
          FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_user_locations_user_location"
        ON "user_locations" ("user_id", "location_id")
    `);
    await queryRunner.query(
      `CREATE INDEX "ix_user_locations_user_id" ON "user_locations" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_user_locations_location_id" ON "user_locations" ("location_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_user_locations_location_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_user_locations_user_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_user_locations_user_location"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_locations"`);
  }
}
