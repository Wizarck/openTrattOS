import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * M3 Wave 2.7 — m3-appcc-export-bundle-service (slice #14): export_bundles
 * table for the APPCC compliance export BC.
 *
 * Per j9.md + FR21-FR27 + ADR-035 (i18n) + ADR-039 (email dispatch). The
 * row stores the operational projection of a generated bundle: status,
 * storage paths, SHA-256 seal, page count + byte size, locale + scope.
 * The regulator-facing record lives on `audit_log` as
 * `EXPORT_BUNDLE_GENERATED` envelopes (retention_class='regulatory'). Both
 * carry the same SHA-256 by construction (the row is updated AFTER the
 * envelope is emitted; cross-validated in tests).
 *
 * Slot selection: the slicing artefact (`docs/openspec-slice-module-3.md`
 * line 120) reserved slot 037 for this slice. At master HEAD `ef23364`
 * slot 037 is already claimed by slice #9 m3-ccp-reading-aggregate
 * (`0037_create_fsms_standards_table.ts`, which itself fell forward from
 * the §3.1 next-free fallback because slot 033 was taken by slice #19 AI
 * obs at merge time). Per `.ai-playbook/specs/migration-slot-reservation.md`
 * §3.1 "next-free at claim time" fallback we claim slot **0038**. The
 * one-slot drift is documented in design.md §Slot reservation.
 *
 * Indexes (per ADR-031):
 *  - `idx_export_bundles_org_created_at` — drives the archive table read
 *    (`SELECT ... FROM export_bundles WHERE organization_id=$1 AND
 *     deleted_at IS NULL ORDER BY created_at DESC LIMIT $2`). Full index.
 *  - `idx_export_bundles_org_status_created_at` — partial index for
 *    status-filtered archive queries (e.g. "show only ready bundles").
 *    `WHERE deleted_at IS NULL` keeps the index tight.
 */
export class CreateExportBundles1700000038000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "export_bundles" (
        "id" uuid PRIMARY KEY,
        "organization_id" uuid NOT NULL,
        "requested_by_user_id" uuid NOT NULL,
        "range_start" timestamptz NOT NULL,
        "range_end" timestamptz NOT NULL,
        "locale" text NOT NULL,
        "scope" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "status" text NOT NULL DEFAULT 'pending',
        "pdf_storage_path" text NULL,
        "csv_storage_path" text NULL,
        "sha256" text NULL,
        "page_count" integer NULL,
        "byte_size" integer NULL,
        "error_message" text NULL,
        "generated_at" timestamptz NULL,
        "archived_at" timestamptz NULL,
        "deleted_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "export_bundles_locale_check"
          CHECK ("locale" IN ('es-ES', 'ca-ES', 'eu-ES', 'gl-ES')),
        CONSTRAINT "export_bundles_status_check"
          CHECK ("status" IN ('pending', 'generating', 'ready', 'failed', 'archived')),
        CONSTRAINT "export_bundles_range_order_check"
          CHECK ("range_end" >= "range_start"),
        CONSTRAINT "export_bundles_sha256_length_check"
          CHECK ("sha256" IS NULL OR length("sha256") = 64),
        CONSTRAINT "fk_export_bundles_org"
          FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_export_bundles_org_created_at"
        ON "export_bundles" ("organization_id", "created_at" DESC);
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_export_bundles_org_status_created_at"
        ON "export_bundles" ("organization_id", "status", "created_at" DESC)
        WHERE "deleted_at" IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_export_bundles_org_status_created_at";`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_export_bundles_org_created_at";`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "export_bundles";`);
  }
}
