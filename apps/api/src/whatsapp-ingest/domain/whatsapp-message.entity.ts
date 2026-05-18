import { randomUUID } from 'node:crypto';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Lifecycle states for an inbound WhatsApp message persisted by the
 * webhook controller.
 *
 *  - `pending`   — webhook persisted the raw body; not yet parsed.
 *  - `parsed`    — parser extracted a recipe draft; `parsedRecipeId` set.
 *  - `failed`    — parser could not extract a draft; `errorMessage` set.
 *  - `ignored`   — message came from an unknown phone number, or was a
 *                  non-text message (image, voice). Recorded for
 *                  observability; no draft created.
 *
 * Sprint 4 W4 (J5) ships only `pending → parsed | failed | ignored`; no
 * outbound reply state is modelled yet because outbound messaging
 * requires Meta-approved templates (see assessment doc §4 Limitations).
 */
export type WhatsappMessageStatus =
  | 'pending'
  | 'parsed'
  | 'failed'
  | 'ignored';

/**
 * Inbound WhatsApp Cloud API message persisted at the webhook boundary
 * for forensic + replay reasons.
 *
 * Multi-tenant: every message is scoped by `organizationId`. The mapping
 * from `fromNumber` → organization is best-effort at receive time; if
 * unresolved the message is persisted under a sentinel organization
 * (the operator's "default org" env, documented in the assessment doc)
 * with status='ignored'.
 *
 * Privacy: `fromNumber` is PII per GDPR. Retention class is
 * `regulatory` (60 days) per privacy module defaults (PrivacyModule
 * Sprint 2 P4) — the physical-deletion cron sweeps this table once the
 * follow-up retention job lands. See assessment doc §5 Privacy notes.
 */
@Entity({ name: 'whatsapp_messages' })
@Index('ix_whatsapp_messages_org_status', ['organizationId', 'status'])
@Index('ix_whatsapp_messages_org_received', ['organizationId', 'receivedAt'])
@Index('ix_whatsapp_messages_from_number', ['fromNumber'])
export class WhatsappMessage {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  /**
   * Tenant scope. Null is rejected at insert; unresolved-tenant messages
   * are persisted under the sentinel default-org id (see service code).
   */
  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  /**
   * Meta's message id (`messages[].id` in the webhook payload, e.g.
   * `wamid.xxx`). UNIQUE per inbound message — used for replay idempotency
   * via `ix_whatsapp_messages_provider_message_id_unique`.
   */
  @Column({ name: 'provider_message_id', type: 'text' })
  providerMessageId!: string;

  /**
   * E.164 phone number of the sender (e.g. `+34612345678`). Meta's
   * payload carries `from` without `+` so the webhook normalises before
   * persist.
   */
  @Column({ name: 'from_number', type: 'text' })
  fromNumber!: string;

  /**
   * Raw text body. Limited to 4096 chars at the DB level — Meta caps
   * inbound text messages at 4096 chars. Null only for non-text
   * messages (image, voice, sticker), in which case `status='ignored'`
   * and `errorMessage` carries a hint.
   */
  @Column({ name: 'body', type: 'text', nullable: true })
  body: string | null = null;

  @Column({ name: 'received_at', type: 'timestamptz' })
  receivedAt!: Date;

  @Column({ type: 'text' })
  status!: WhatsappMessageStatus;

  /**
   * UUID of the Recipe draft the parser created on success. Null until
   * `status='parsed'`. The FK is intentionally NOT declared at the DB
   * level — recipes is in a different bounded context and we keep the
   * cross-BC link soft (consistent with photo-ingestion's downstream-
   * routing pattern, ADR-DOWNSTREAM-ROUTING-IDEMPOTENCY).
   */
  @Column({ name: 'parsed_recipe_id', type: 'uuid', nullable: true })
  parsedRecipeId: string | null = null;

  /**
   * Free-text error / hint when `status='failed'` or `status='ignored'`.
   * Null on the happy path. Surface in the operator's WhatsApp tab
   * (deferred to M2.x — see j5.md §components).
   */
  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null = null;

  /**
   * Raw payload as Meta delivered it, for forensic replay. JSONB so the
   * 4096-char body + arbitrary metadata round-trip without escaping
   * issues. Operator can replay any failed message against a new parser
   * version without re-pulling from Meta.
   */
  @Column({ name: 'raw_payload', type: 'jsonb', nullable: true })
  rawPayload: Record<string, unknown> | null = null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  /** Factory keeps validation + id minting in one place. */
  static create(props: {
    organizationId: string;
    providerMessageId: string;
    fromNumber: string;
    body: string | null;
    receivedAt: Date;
    rawPayload: Record<string, unknown> | null;
  }): WhatsappMessage {
    if (!props.providerMessageId) {
      throw new Error('WhatsappMessage.providerMessageId is required');
    }
    if (!props.fromNumber) {
      throw new Error('WhatsappMessage.fromNumber is required');
    }
    const m = new WhatsappMessage();
    m.id = randomUUID();
    m.organizationId = props.organizationId;
    m.providerMessageId = props.providerMessageId;
    m.fromNumber = WhatsappMessage.normalisePhone(props.fromNumber);
    m.body = props.body;
    m.receivedAt = props.receivedAt;
    m.status = 'pending';
    m.rawPayload = props.rawPayload;
    return m;
  }

  markParsed(recipeId: string): void {
    if (this.status !== 'pending') {
      throw new Error(
        `WhatsappMessage.markParsed: status must be 'pending'; got '${this.status}'`,
      );
    }
    this.status = 'parsed';
    this.parsedRecipeId = recipeId;
    this.errorMessage = null;
  }

  markFailed(message: string): void {
    if (this.status !== 'pending') {
      throw new Error(
        `WhatsappMessage.markFailed: status must be 'pending'; got '${this.status}'`,
      );
    }
    this.status = 'failed';
    this.errorMessage = message;
  }

  markIgnored(reason: string): void {
    if (this.status !== 'pending') {
      throw new Error(
        `WhatsappMessage.markIgnored: status must be 'pending'; got '${this.status}'`,
      );
    }
    this.status = 'ignored';
    this.errorMessage = reason;
  }

  /** Meta sends `34612345678`; we store `+34612345678` (E.164). */
  private static normalisePhone(raw: string): string {
    const trimmed = raw.trim();
    if (trimmed.startsWith('+')) return trimmed;
    return `+${trimmed}`;
  }
}
