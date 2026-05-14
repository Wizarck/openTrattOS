import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * M3 Wave 2.6 — m3-ccp-reading-aggregate (slice #9): FSMS standards table.
 *
 * `fsms_standards` is the operator-defined Food Safety Management System
 * configuration: one row per `(organization, name, version)` tuple. The
 * `effective_from / effective_until` pair defines the time window during which
 * the standard is the active one for that name. Per design.md Decision A
 * the CCP definitions live in the `ccp_definitions` JSONB column — CCPs are
 * NOT a separate table.
 *
 * Per design.md Decision B, every `haccp_ccp_readings` row pins the FSMS
 * standard version active at write time. This migration ALSO adds the FK
 * `haccp_ccp_readings.fsms_standard_id → fsms_standards(id)`. Migration 0034
 * created the column but deferred the FK because `fsms_standards` did not
 * yet exist; this migration closes the loop.
 *
 * Slot selection: per `docs/openspec-slice-module-3.md` line 115 the slice is
 * allotted `033-034`. Slot 0033 was already claimed at merge time by the M3
 * AI obs rollup (slice #19) — this slice consumes the next-free pair
 * `0034 + 0037` per the `migration-slot-reservation.md` §3.1 fallback rule.
 *
 * Indexes (per ADR-031):
 *  - `idx_fsms_standards_org_name_effective_from` — drives `getActiveStandard(orgId, name, at)`
 *    resolution: `WHERE organization_id=$1 AND name=$2 AND effective_from <= $3 ORDER BY effective_from DESC LIMIT 1`.
 *
 * Uniqueness constraint: `(organization_id, name, version)` UNIQUE so an
 * Owner cannot re-publish the same version twice for the same standard name.
 */
export class CreateFsmsStandardsTable1700000037000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "fsms_standards" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "name" text NOT NULL,
        "version" text NOT NULL,
        "effective_from" timestamptz NOT NULL,
        "effective_until" timestamptz NULL,
        "ccp_definitions" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "fsms_standards_name_length_check"
          CHECK (length("name") BETWEEN 1 AND 200),
        CONSTRAINT "fsms_standards_version_length_check"
          CHECK (length("version") BETWEEN 1 AND 50),
        CONSTRAINT "fsms_standards_window_order_check"
          CHECK ("effective_until" IS NULL OR "effective_until" > "effective_from"),
        CONSTRAINT "fsms_standards_unique_org_name_version"
          UNIQUE ("organization_id", "name", "version"),
        CONSTRAINT "fk_fsms_standards_org"
          FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_fsms_standards_org_name_effective_from"
        ON "fsms_standards" ("organization_id", "name", "effective_from" DESC);
    `);

    await queryRunner.query(`
      ALTER TABLE "haccp_ccp_readings"
        ADD CONSTRAINT "fk_haccp_ccp_readings_fsms_standard"
        FOREIGN KEY ("fsms_standard_id") REFERENCES "fsms_standards"("id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "haccp_ccp_readings"
        DROP CONSTRAINT IF EXISTS "fk_haccp_ccp_readings_fsms_standard";
    `);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_fsms_standards_org_name_effective_from";`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "fsms_standards";`);
  }
}
