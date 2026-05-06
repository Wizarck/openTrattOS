import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  ES_VECTOR_SQL_MIGRATION,
  EN_VECTOR_SQL_MIGRATION,
} from '../audit-log/application/audit-log-fts.sql';

/**
 * M2 Wave 1.11 — m2-audit-log-fts: dual-config functional GIN indexes for
 * full-text search across `audit_log` (`payload_before`, `payload_after`,
 * `reason`, `snippet`).
 *
 * Per Gate D picks (F1=a, F2=d, SD1=b):
 * - Functional GIN indexes (no stored `tsv` column) — saves row size, no
 *   entity surface area, no per-insert generated-column overhead.
 * - Two indexes (one Spanish, one English) — bitmap-OR'd at query time so
 *   `tomate` matches Spanish stems and `chicken` matches English stems
 *   without the client declaring a language.
 * - `jsonb_to_tsvector(..., '["string"]')` extracts only string values from
 *   the jsonb tree (skipping numbers, booleans, keys, punctuation noise).
 *
 * Postgres builds the indexes by scanning all existing rows at CREATE INDEX
 * time — no manual backfill (F4=OK).
 *
 * The exact expression text is shared with `AuditLogService.query()` via
 * `audit-log-fts.sql.ts` to guarantee planner contract.
 *
 * `hasTable` guard so the migration runs cleanly on fresh schemas where
 * audit_log is created in the same migration batch.
 */
export class AuditLogFts1700000019000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.hasTable('audit_log');
    if (!exists) {
      return;
    }

    await queryRunner.query(`
      CREATE INDEX "ix_audit_log_fts_es"
      ON "audit_log"
      USING GIN ((${ES_VECTOR_SQL_MIGRATION}))
    `);

    await queryRunner.query(`
      CREATE INDEX "ix_audit_log_fts_en"
      ON "audit_log"
      USING GIN ((${EN_VECTOR_SQL_MIGRATION}))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_audit_log_fts_en"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_audit_log_fts_es"`);
  }
}
