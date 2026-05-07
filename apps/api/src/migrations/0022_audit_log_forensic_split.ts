import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * M2 Wave 1.14 — m2-audit-log-forensic-split: backfill the channel split
 * defined in ADR-026.
 *
 * Pre-this-slice, `AGENT_ACTION_EXECUTED` carried two payload shapes
 * discriminated by aggregate_type:
 *   - lean (aggregate_type='organization')  → request attribution from
 *     AgentAuditMiddleware (Wave 1.5).
 *   - rich (aggregate_type ∈ {recipe, …})    → mutation forensics from
 *     BeforeAfterAuditInterceptor (Wave 1.13 [3a]) and AgentChatService
 *     (Wave 1.13 [3b]).
 *
 * This migration reassigns historical rich rows to the new
 * `AGENT_ACTION_FORENSIC` event_type. The `event_type` column is open-enum
 * text per ADR-025 — no schema change is required.
 *
 * `hasTable` guard so the migration runs cleanly on fresh schemas where
 * `audit_log` was never created (e.g. a new dev environment running the
 * full migration set in order).
 */
export class AuditLogForensicSplit1700000022000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.hasTable('audit_log');
    if (!exists) {
      return;
    }

    await queryRunner.query(`
      UPDATE "audit_log"
      SET "event_type" = 'AGENT_ACTION_FORENSIC'
      WHERE "event_type" = 'AGENT_ACTION_EXECUTED'
        AND "aggregate_type" <> 'organization'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.hasTable('audit_log');
    if (!exists) {
      return;
    }

    await queryRunner.query(`
      UPDATE "audit_log"
      SET "event_type" = 'AGENT_ACTION_EXECUTED'
      WHERE "event_type" = 'AGENT_ACTION_FORENSIC'
    `);
  }
}
