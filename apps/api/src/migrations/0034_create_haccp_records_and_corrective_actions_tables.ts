import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * M3 Wave 2.6 — m3-ccp-reading-aggregate (slice #9): HACCP backend BC tables.
 *
 * Two tables created in order:
 *  1. `haccp_corrective_actions` — referenced by `haccp_ccp_readings.corrective_action_id`
 *     FK; must exist first.
 *  2. `haccp_ccp_readings` — every CCP reading row, tenant-scoped + soft-delete.
 *     CHECK constraint `haccp_readings_corrective_when_out_of_spec` mirrors the
 *     service-layer gate per design.md Decision C: out-of-spec rows MUST carry
 *     a `corrective_action_id`.
 *
 * The FK `haccp_ccp_readings.fsms_standard_id → fsms_standards(id)` is added
 * by migration 0037 (which creates `fsms_standards`), via `ALTER TABLE` after
 * the parent table exists. This keeps the migration pair forward-only and
 * idempotent without forward-FK referencing.
 *
 * Slot reservation: per `docs/openspec-slice-module-3.md` line 115 the slice
 * is allotted slots `033-034`. Slot 0033 was claimed at merge time by the M3
 * AI obs rollup (slice #19) — this slice consumes the next-free pair
 * `0034 + 0037` per the `migration-slot-reservation.md` §3.1 fallback rule.
 *
 * Indexes (per ADR-031):
 *  - `idx_haccp_readings_org_ccp_created` — j10 RecentReadingsStrip + the
 *    sticky-warning probe (`last_out_of_spec_unresolved`).
 *  - `idx_haccp_readings_org_fsms_created` — APPCC export per-standard
 *    rollup (slice #15 consumer).
 *  - `idx_haccp_corrective_actions_org_fsms_ccp` — corrective-action picker
 *    query.
 */
export class CreateHaccpRecordsAndCorrectiveActionsTables1700000034000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "haccp_corrective_actions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "fsms_standard_id" uuid NOT NULL,
        "ccp_id" text NOT NULL,
        "name" text NOT NULL,
        "notes" text NULL,
        "creation_mode" text NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz NULL,
        CONSTRAINT "haccp_corrective_actions_creation_mode_check"
          CHECK ("creation_mode" IN ('predefined','ad-hoc')),
        CONSTRAINT "haccp_corrective_actions_name_length_check"
          CHECK (length("name") BETWEEN 1 AND 200),
        CONSTRAINT "fk_haccp_corrective_actions_org"
          FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_haccp_corrective_actions_org_fsms_ccp"
        ON "haccp_corrective_actions" ("organization_id", "fsms_standard_id", "ccp_id");
    `);

    await queryRunner.query(`
      CREATE TABLE "haccp_ccp_readings" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "fsms_standard_id" uuid NOT NULL,
        "fsms_standard_version" text NOT NULL,
        "ccp_id" text NOT NULL,
        "reading_value" numeric(18,4) NULL,
        "reading_unit" text NULL,
        "reading_extras" jsonb NULL,
        "spec_min" numeric(18,4) NULL,
        "spec_max" numeric(18,4) NULL,
        "in_spec" boolean NOT NULL,
        "corrective_action_id" uuid NULL,
        "actor_user_id" uuid NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz NULL,
        CONSTRAINT "haccp_readings_corrective_when_out_of_spec"
          CHECK ("in_spec" = true OR "corrective_action_id" IS NOT NULL),
        CONSTRAINT "haccp_readings_ccp_id_length_check"
          CHECK (length("ccp_id") BETWEEN 1 AND 100),
        CONSTRAINT "fk_haccp_ccp_readings_org"
          FOREIGN KEY ("organization_id") REFERENCES "organizations"("id"),
        CONSTRAINT "fk_haccp_ccp_readings_corrective_action"
          FOREIGN KEY ("corrective_action_id") REFERENCES "haccp_corrective_actions"("id")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_haccp_readings_org_ccp_created"
        ON "haccp_ccp_readings" ("organization_id", "ccp_id", "created_at" DESC);
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_haccp_readings_org_fsms_created"
        ON "haccp_ccp_readings" ("organization_id", "fsms_standard_id", "created_at" DESC);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_haccp_readings_org_fsms_created";`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_haccp_readings_org_ccp_created";`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "haccp_ccp_readings";`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_haccp_corrective_actions_org_fsms_ccp";`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "haccp_corrective_actions";`);
  }
}
