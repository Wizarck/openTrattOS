import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sprint 4 W4 (J5) — whatsapp-ingest skeleton: create `whatsapp_messages`.
 *
 * Backs the inbound WhatsApp webhook controller. Stores every text message
 * Meta delivers to `/api/webhooks/whatsapp` for forensic + replay reasons.
 * See docs/sprint4-j5-whatsapp-assessment.md for the scope-honest
 * description of what this slice ships vs what still needs Meta Business
 * API external setup.
 *
 * Schema rationale:
 *
 *  - `provider_message_id text NOT NULL` + UNIQUE — Meta's `wamid.xxx`;
 *    drives idempotency on webhook redelivery (Meta retries with the same
 *    id when the receiver does not 200 within ~5 s).
 *
 *  - `from_number text NOT NULL` — E.164 (`+34612345678`). PII per GDPR.
 *    The privacy module's physical-deletion cron sweeps this table once
 *    the follow-up retention slice lands; see assessment doc §5.
 *
 *  - `body text NULL` — Meta caps inbound at 4096 chars; null only when
 *    the message was non-text (image, voice, sticker) → `status='ignored'`.
 *
 *  - `status text NOT NULL` with CHECK — mirrors slice #1 pattern (no
 *    Postgres enum). Application enforces the state machine
 *    (`pending → parsed | failed | ignored`).
 *
 *  - `parsed_recipe_id uuid NULL` — soft FK into `recipes` (cross-BC link
 *    kept soft per ADR-DOWNSTREAM-ROUTING-IDEMPOTENCY).
 *
 *  - `raw_payload jsonb NULL` — full Meta payload for replay against a
 *    new parser version. Null only when persistence ran out of space (we
 *    still record the headline fields).
 *
 *  - 3 indexes:
 *      * `ix_whatsapp_messages_org_status`     — powers the future
 *        operator "WhatsApp inbox" filter (default `status=pending`).
 *      * `ix_whatsapp_messages_org_received`   — powers a chronological
 *        timeline view.
 *      * `ix_whatsapp_messages_from_number`    — powers per-sender
 *        lookup ("show me every message Lourdes sent").
 *
 *  - `fk_whatsapp_messages_organization` — ON DELETE NO ACTION so
 *    deleting an org does NOT silently drop the audit trail.
 *
 * Down: drops indexes, then the table (idempotent IF EXISTS).
 */
export class CreateWhatsappMessages1700000047000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "whatsapp_messages" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "organization_id" uuid NOT NULL,
        "provider_message_id" text NOT NULL,
        "from_number" text NOT NULL,
        "body" text NULL,
        "received_at" timestamptz NOT NULL,
        "status" text NOT NULL DEFAULT 'pending',
        "parsed_recipe_id" uuid NULL,
        "error_message" text NULL,
        "raw_payload" jsonb NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "whatsapp_messages_status_check"
          CHECK ("status" IN ('pending','parsed','failed','ignored')),
        CONSTRAINT "fk_whatsapp_messages_organization"
          FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
      );
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "ix_whatsapp_messages_provider_message_id_unique"
        ON "whatsapp_messages" ("provider_message_id");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "ix_whatsapp_messages_org_status"
        ON "whatsapp_messages" ("organization_id", "status");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "ix_whatsapp_messages_org_received"
        ON "whatsapp_messages" ("organization_id", "received_at" DESC);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "ix_whatsapp_messages_from_number"
        ON "whatsapp_messages" ("from_number");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "ix_whatsapp_messages_from_number";`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "ix_whatsapp_messages_org_received";`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "ix_whatsapp_messages_org_status";`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "ix_whatsapp_messages_provider_message_id_unique";`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "whatsapp_messages";`);
  }
}
