import { Injectable, Logger } from '@nestjs/common';
import { WhatsappMessage } from '../domain/whatsapp-message.entity';
import { WhatsappMessageRepository } from '../infrastructure/whatsapp-message.repository';
import { ParseRecipeFromTextService } from './parse-recipe-from-text.service';

/**
 * Result of processing a single pending message — returned for
 * observability + tests; the webhook controller does NOT block on this
 * (Meta needs a 200 within ~5 s).
 */
export interface ProcessMessageResult {
  messageId: string;
  status: 'parsed' | 'failed' | 'ignored';
  parsedRecipeId: string | null;
  errorMessage: string | null;
}

/**
 * Sprint 4 W4 (J5) — drives a single inbound WhatsApp message through
 * the parser and (in M2.x) the outbound reply.
 *
 * **Scope honesty**: this service does NOT currently create a Recipe
 * draft in the recipes BC. The j5.md spec requires:
 *
 *  (a) a `pending_review` lifecycle state on Recipe (not yet shipped),
 *  (b) a `created_via_channel` column on Recipe (not yet shipped),
 *  (c) per-org phone-number → User mapping for routing (User entity
 *      retrofit not yet shipped).
 *
 * Without those three pieces a "draft" we create here would land in the
 * canonical recipe surface and confuse the operator. The skeleton here
 * persists the parsed extraction in `whatsapp_messages.raw_payload`
 * under the `parserOutput` key and marks the row `parsed` — the
 * downstream wiring is the M2.x slice.
 *
 * The outbound reply (Meta Graph API POST) is also stubbed — Meta
 * requires approved templates for any non-conversation reply outside
 * the 24h window. See assessment doc §4 Limitations.
 */
@Injectable()
export class WhatsappIngestService {
  private readonly logger = new Logger(WhatsappIngestService.name);

  constructor(
    private readonly repo: WhatsappMessageRepository,
    private readonly parser: ParseRecipeFromTextService,
  ) {}

  async processMessage(message: WhatsappMessage): Promise<ProcessMessageResult> {
    if (message.status !== 'pending') {
      return {
        messageId: message.id,
        status: message.status === 'parsed' || message.status === 'failed' || message.status === 'ignored'
          ? message.status
          : 'failed',
        parsedRecipeId: message.parsedRecipeId,
        errorMessage: message.errorMessage,
      };
    }

    // Non-text messages (Meta sets `body` to null) are ignored. The
    // payload survives in `raw_payload` for forensic replay against a
    // future multimodal parser.
    if (message.body === null) {
      message.markIgnored('non-text message (image / voice / sticker)');
      await this.repo.save(message);
      return {
        messageId: message.id,
        status: 'ignored',
        parsedRecipeId: null,
        errorMessage: message.errorMessage,
      };
    }

    const draft = this.parser.parse(message.body);
    if (draft === null) {
      message.markFailed('parser could not extract a recipe draft');
      await this.repo.save(message);
      return {
        messageId: message.id,
        status: 'failed',
        parsedRecipeId: null,
        errorMessage: message.errorMessage,
      };
    }

    // Stash the parser output on `raw_payload.parserOutput` so the M2.x
    // wiring can lift it into the recipes BC without re-running the
    // parser. The actual Recipe creation lands in M2.x once (a) + (b)
    // + (c) above ship.
    const rawPayload = (message.rawPayload ?? {}) as Record<string, unknown>;
    rawPayload.parserOutput = draft;
    message.rawPayload = rawPayload;

    // Sprint 4 W4 marks the row as `parsed` with a NULL recipe id — the
    // operator UI surface (M2.x) will list these as "drafts pending
    // wiring" until the recipes BC accepts a `pending_review` create.
    message.status = 'parsed';
    message.parsedRecipeId = null;
    message.errorMessage = null;
    await this.repo.save(message);

    this.logger.log(
      `whatsapp-ingest.parsed message=${message.id} from=${message.fromNumber} ` +
        `name="${draft.name}" ingredients=${draft.ingredients.length}`,
    );

    return {
      messageId: message.id,
      status: 'parsed',
      parsedRecipeId: null,
      errorMessage: null,
    };
  }
}
