import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * M2 OFF mirror schema (per openspec/changes/m2-off-mirror/{design,specs}.md):
 *   - 1 new table: external_food_catalog (org-AGNOSTIC global cache, region-scoped)
 *
 * Design notes:
 *   - No multi-tenant column: this is a SHARED cache by region (ADR-015 hybrid mirror).
 *   - No full audit fields: rows are externally sourced from OFF, so `synced_at`
 *     replaces created_by/updated_by per design.md §"What ships".
 *   - `nutrition` is jsonb to absorb OFF schema drift without further migrations.
 *   - `allergens` and `diet_flags` follow the M2 wave-0 `text[] NOT NULL DEFAULT '{}'` pattern.
 *   - `pg_trgm` extension is created before the GIN index used for fuzzy name search.
 *   - `license_attribution` is non-null and persisted on every row for ODbL compliance.
 */
export class M2OffMirror1700000010000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Required for fuzzy `name` trigram search (`gin_trgm_ops`). No-op if already enabled.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

    await queryRunner.query(`
      CREATE TABLE "external_food_catalog" (
        "id"                   uuid          PRIMARY KEY,
        "barcode"              varchar(32)   NOT NULL,
        "name"                 varchar(300)  NOT NULL,
        "brand"                varchar(200)  NULL,
        "nutrition"            jsonb         NULL,
        "allergens"            text[]        NOT NULL DEFAULT '{}',
        "diet_flags"           text[]        NOT NULL DEFAULT '{}',
        "region"               varchar(8)    NOT NULL,
        "last_modified_at"     timestamptz   NULL,
        "license_attribution"  text          NOT NULL,
        "synced_at"            timestamptz   NOT NULL DEFAULT now(),
        CONSTRAINT "ck_external_food_catalog_barcode_nonblank"
          CHECK (length(trim(both from "barcode")) > 0),
        CONSTRAINT "ck_external_food_catalog_name_nonblank"
          CHECK (length(trim(both from "name")) > 0),
        CONSTRAINT "ck_external_food_catalog_region_nonblank"
          CHECK (length(trim(both from "region")) > 0),
        CONSTRAINT "ck_external_food_catalog_license_nonblank"
          CHECK (length(trim(both from "license_attribution")) > 0)
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_external_food_catalog_barcode" ON "external_food_catalog" ("barcode")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_external_food_catalog_region_last_modified" ON "external_food_catalog" ("region", "last_modified_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_external_food_catalog_name_trgm" ON "external_food_catalog" USING gin ("name" gin_trgm_ops)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_external_food_catalog_name_trgm"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_external_food_catalog_region_last_modified"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_external_food_catalog_barcode"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "external_food_catalog"`);
    // pg_trgm extension intentionally NOT dropped — may be used by other tables.
  }
}
