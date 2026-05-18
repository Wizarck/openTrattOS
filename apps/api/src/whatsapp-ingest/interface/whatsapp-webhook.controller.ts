import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { WhatsappMessage } from '../domain/whatsapp-message.entity';
import { WhatsappMessageRepository } from '../infrastructure/whatsapp-message.repository';
import { WhatsappIngestService } from '../application/whatsapp-ingest.service';
import { verifyWhatsappSignature } from '../application/whatsapp-signature';

/**
 * Meta-shape webhook payload — narrowed to the fields this controller
 * consumes. Meta's full schema is much richer (statuses, errors, media
 * objects); we accept-then-ignore unknown keys to stay forward-compat.
 */
interface MetaWebhookPayload {
  object?: string;
  entry?: ReadonlyArray<{
    id?: string;
    changes?: ReadonlyArray<{
      field?: string;
      value?: {
        messaging_product?: string;
        metadata?: {
          phone_number_id?: string;
          display_phone_number?: string;
        };
        messages?: ReadonlyArray<{
          id?: string;
          from?: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
        }>;
      };
    }>;
  }>;
}

/**
 * Sprint 4 W4 (J5) — Meta WhatsApp Cloud API inbound webhook.
 *
 * Mounted at `POST /api/webhooks/whatsapp` (the global `/api` prefix
 * from `main.ts` applies). Public endpoint — Meta will not authenticate
 * with a Bearer token, so the only trust signal is the
 * `X-Hub-Signature-256` header computed against the RAW request body
 * with the operator's `WHATSAPP_WEBHOOK_SECRET` (the Meta "App Secret").
 *
 * Contract with Meta:
 *  - We MUST respond 200 within ~5 s, else Meta retries. We therefore
 *    persist the message synchronously (cheap INSERT) but defer
 *    parsing + the outbound reply to a follow-up tick (`setImmediate`).
 *  - Idempotency on `provider_message_id` (Meta's `wamid.xxx`) — replays
 *    silently no-op and 200.
 *  - Unknown sender numbers are persisted under a sentinel default-org
 *    id (`WHATSAPP_DEFAULT_ORGANIZATION_ID` env) with `status='ignored'`
 *    so the operator can audit them without enabling onboarding-by-
 *    WhatsApp (per j5.md §Open questions).
 *
 * **Scope honesty**: the only piece that WORKS without external Meta
 * setup is the signature verification (real HMAC-SHA256, exercised by
 * `whatsapp-signature.spec.ts`). The downstream parse + recipe-draft
 * wiring requires Meta to actually deliver a webhook, which in turn
 * requires the full operator runbook in the assessment doc §3.
 */
@ApiTags('WhatsApp Webhook')
@Controller('webhooks/whatsapp')
export class WhatsappWebhookController {
  private readonly logger = new Logger(WhatsappWebhookController.name);

  constructor(
    private readonly repo: WhatsappMessageRepository,
    private readonly ingest: WhatsappIngestService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Receive an inbound WhatsApp Cloud API delivery (signature-verified).',
  })
  async receive(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signatureHeader?: string,
  ): Promise<{ received: boolean; persisted: number; skipped: number }> {
    const secret = process.env.WHATSAPP_WEBHOOK_SECRET ?? '';
    const rawBody = req.rawBody;

    if (!secret) {
      // Fail-closed: missing operator config means we cannot trust the
      // request. Returning 401 to Meta will cause retry-with-backoff,
      // which is the correct signal to the operator that secret is
      // unset. Logged at ERROR so observability alerts.
      this.logger.error(
        'whatsapp-webhook.misconfigured WHATSAPP_WEBHOOK_SECRET env is empty — rejecting',
      );
      throw new UnauthorizedException({
        code: 'WHATSAPP_WEBHOOK_MISCONFIGURED',
        message: 'webhook secret not set on this nexandro instance',
      });
    }
    if (!rawBody || rawBody.length === 0) {
      this.logger.warn('whatsapp-webhook.rejected empty raw body');
      throw new UnauthorizedException({
        code: 'WHATSAPP_WEBHOOK_NO_BODY',
        message: 'raw body unavailable; check NestFactory.create({ rawBody: true })',
      });
    }

    const ok = verifyWhatsappSignature({
      rawBody,
      signatureHeader,
      appSecret: secret,
    });
    if (!ok) {
      this.logger.warn(
        `whatsapp-webhook.rejected signature mismatch (header=${signatureHeader ?? '<missing>'})`,
      );
      throw new UnauthorizedException({
        code: 'WHATSAPP_WEBHOOK_BAD_SIGNATURE',
        message: 'X-Hub-Signature-256 verification failed',
      });
    }

    // Parse the (now trusted) body. We re-parse from raw to keep parity
    // with the bytes we hashed.
    let payload: MetaWebhookPayload;
    try {
      payload = JSON.parse(rawBody.toString('utf8')) as MetaWebhookPayload;
    } catch (err) {
      this.logger.warn(
        `whatsapp-webhook.invalid json ${err instanceof Error ? err.message : String(err)}`,
      );
      // Signature was valid but body wasn't JSON → still 200 so Meta
      // doesn't retry, but log loudly.
      return { received: true, persisted: 0, skipped: 0 };
    }

    const defaultOrgId = process.env.WHATSAPP_DEFAULT_ORGANIZATION_ID ?? '';
    const messages = this.flattenMessages(payload);

    let persisted = 0;
    let skipped = 0;
    for (const meta of messages) {
      try {
        const existing = await this.repo.findByProviderMessageId(meta.id);
        if (existing) {
          skipped += 1;
          continue;
        }
        if (!defaultOrgId) {
          this.logger.warn(
            `whatsapp-webhook.no-default-org dropping message id=${meta.id} from=${meta.from} ` +
              `— set WHATSAPP_DEFAULT_ORGANIZATION_ID to capture for review`,
          );
          skipped += 1;
          continue;
        }
        const row = WhatsappMessage.create({
          organizationId: defaultOrgId,
          providerMessageId: meta.id,
          fromNumber: meta.from,
          body: meta.body,
          receivedAt: meta.receivedAt,
          rawPayload: meta.raw,
        });
        await this.repo.save(row);
        persisted += 1;

        // Process asynchronously so Meta gets its 200 fast. Errors here
        // are swallowed + logged; the row stays `pending` and a follow-
        // up retry tick (deferred) can re-process.
        setImmediate(() => {
          this.ingest.processMessage(row).catch((err) => {
            this.logger.error(
              `whatsapp-ingest.async-failed message=${row.id} ` +
                `${err instanceof Error ? err.message : String(err)}`,
            );
          });
        });
      } catch (err) {
        this.logger.error(
          `whatsapp-webhook.persist-failed id=${meta.id} ` +
            `${err instanceof Error ? err.message : String(err)}`,
        );
        skipped += 1;
      }
    }

    return { received: true, persisted, skipped };
  }

  /**
   * Flatten Meta's nested `entry[].changes[].value.messages[]` array
   * into the local shape. Non-text messages keep `body=null` so the
   * downstream service can mark them `ignored` with the right reason.
   */
  private flattenMessages(payload: MetaWebhookPayload): Array<{
    id: string;
    from: string;
    body: string | null;
    receivedAt: Date;
    raw: Record<string, unknown>;
  }> {
    const out: Array<{
      id: string;
      from: string;
      body: string | null;
      receivedAt: Date;
      raw: Record<string, unknown>;
    }> = [];
    const entries = payload.entry ?? [];
    for (const entry of entries) {
      const changes = entry.changes ?? [];
      for (const change of changes) {
        const value = change.value;
        const messages = value?.messages ?? [];
        for (const msg of messages) {
          if (!msg.id || !msg.from) continue;
          const isText = msg.type === 'text';
          const body = isText ? (msg.text?.body ?? null) : null;
          const ts = msg.timestamp ? Number(msg.timestamp) * 1000 : Date.now();
          out.push({
            id: msg.id,
            from: msg.from,
            body,
            receivedAt: new Date(ts),
            raw: msg as unknown as Record<string, unknown>,
          });
        }
      }
    }
    return out;
  }
}
