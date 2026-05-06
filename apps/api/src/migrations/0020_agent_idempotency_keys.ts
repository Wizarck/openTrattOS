import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * M2 Wave 1.13 — m2-mcp-write-capabilities: idempotency table for the
 * `Idempotency-Key` HTTP header on agent-routed writes.
 *
 * Per Gate D F4=a + SD4=a: Postgres-backed deduplication, 24h TTL.
 *
 * Schema rationale:
 * - `(organization_id, key)` PRIMARY KEY — natural lookup; deduplicates
 *   concurrent inserts via ON CONFLICT DO NOTHING.
 * - `request_hash` lets us detect "same key, different body" (HTTP 409
 *   IDEMPOTENCY_KEY_REQUEST_MISMATCH) — Stripe convention.
 * - `response_status` + `response_body jsonb` for replay.
 * - `created_at` indexed for hourly TTL cleanup cron
 *   `DELETE FROM agent_idempotency_keys WHERE created_at < now() - interval '24 hours'`.
 */
export class AgentIdempotencyKeys1700000020000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "agent_idempotency_keys" (
        "organization_id" uuid     NOT NULL,
        "key"             text     NOT NULL,
        "request_hash"    text     NOT NULL,
        "response_status" int      NOT NULL,
        "response_body"   jsonb    NOT NULL,
        "created_at"      timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("organization_id", "key"),
        CONSTRAINT "agent_idempotency_keys_key_length_check"
          CHECK (char_length("key") BETWEEN 1 AND 200),
        CONSTRAINT "agent_idempotency_keys_status_range_check"
          CHECK ("response_status" BETWEEN 100 AND 599)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "ix_agent_idempotency_keys_created_at"
      ON "agent_idempotency_keys" ("created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "ix_agent_idempotency_keys_created_at"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "agent_idempotency_keys"`);
  }
}
