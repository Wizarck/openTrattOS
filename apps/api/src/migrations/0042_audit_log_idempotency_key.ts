import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * M3.x — m3.x-audit-log-idempotency-required-mode: add an opt-in dedup
 * key to `audit_log` rows so producers that want exactly-once semantics
 * within a sliding 24h window can pass `idempotencyKey` on the envelope
 * and `AuditLogService.record()` rejects duplicates with
 * `IdempotencyConflictError`.
 *
 * Design picks (locked by master):
 *  - Enforcement mode: REJECT + log on duplicate (no swallow).
 *  - Detection window: SLIDING 24h, app-side SELECT — NO `UNIQUE` DB
 *    constraint because a fixed UNIQUE would either over-reject (lifetime
 *    of the audit log) or require a constraint with a `WHERE created_at >
 *    NOW() - INTERVAL '24h'` predicate, which Postgres does not support
 *    on UNIQUE.
 *
 * Schema additions:
 *  - `idempotency_key text NULL` — opt-in per producer. NULL keeps the
 *    legacy no-dedup behaviour for every existing call site.
 *  - `ix_audit_log_idempotency` — partial btree on
 *    `(organization_id, idempotency_key, created_at DESC)
 *     WHERE idempotency_key IS NOT NULL` — drives the sliding-window
 *    SELECT used by `AuditLogService.record()`. Partial because the
 *    typical fleet has near-zero rows with `idempotency_key` populated
 *    (only opt-in producers fill it).
 *
 * Idempotent on re-run: ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT
 * EXISTS so a partial apply / retry converges.
 *
 * Down: reverses each ADD in reverse order so a failed up() leaves no
 * partial state.
 */
export class AuditLogIdempotencyKey1700000042000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.hasTable('audit_log');
    if (!exists) {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "audit_log"
        ADD COLUMN IF NOT EXISTS "idempotency_key" text NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "ix_audit_log_idempotency"
        ON "audit_log" ("organization_id", "idempotency_key", "created_at" DESC)
        WHERE "idempotency_key" IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.hasTable('audit_log');
    if (!exists) {
      return;
    }
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_audit_log_idempotency";`);
    await queryRunner.query(
      `ALTER TABLE "audit_log" DROP COLUMN IF EXISTS "idempotency_key";`,
    );
  }
}
