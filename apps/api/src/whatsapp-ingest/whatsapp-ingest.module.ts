import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ParseRecipeFromTextService } from './application/parse-recipe-from-text.service';
import { WhatsappIngestService } from './application/whatsapp-ingest.service';
import { WhatsappMessage } from './domain/whatsapp-message.entity';
import { WhatsappMessageRepository } from './infrastructure/whatsapp-message.repository';
import { WhatsappVerifyController } from './interface/whatsapp-verify.controller';
import { WhatsappWebhookController } from './interface/whatsapp-webhook.controller';

/**
 * Sprint 4 W4 (J5) — WhatsApp ingest BC (skeleton).
 *
 * Wires the inbound webhook controller (POST /api/webhooks/whatsapp),
 * the Meta verification handshake (GET /api/webhooks/whatsapp), the
 * `whatsapp_messages` entity + repo, the regex parser stub, and the
 * orchestration service.
 *
 * **Scope honesty**: end-to-end integration requires external Meta
 * WhatsApp Business API setup. See docs/sprint4-j5-whatsapp-assessment.md
 * for the operator runbook + the list of pieces this slice does NOT
 * ship (outbound replies, Hermes LLM parser, recipes-BC pending_review
 * lifecycle wiring).
 *
 * The module is intentionally self-contained — no imports of other BCs.
 * The recipes BC integration is the M2.x slice (j5.md §What M2 must
 * keep open §1 lifecycle state).
 */
@Module({
  imports: [TypeOrmModule.forFeature([WhatsappMessage])],
  controllers: [WhatsappWebhookController, WhatsappVerifyController],
  providers: [
    WhatsappMessageRepository,
    ParseRecipeFromTextService,
    WhatsappIngestService,
  ],
  exports: [
    WhatsappMessageRepository,
    ParseRecipeFromTextService,
    WhatsappIngestService,
  ],
})
export class WhatsappIngestModule {}
