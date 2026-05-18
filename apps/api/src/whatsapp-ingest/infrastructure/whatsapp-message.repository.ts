import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsappMessage, WhatsappMessageStatus } from '../domain/whatsapp-message.entity';

/**
 * Multi-tenant repository for {@link WhatsappMessage}.
 *
 * Per ADR-MULTI-TENANT-GATE: every per-org method takes `organizationId`
 * as the FIRST parameter and includes it in every query. Idempotency
 * lookups (`findByProviderMessageId`) are tenant-agnostic by design — a
 * Meta `wamid.xxx` is globally unique and the controller MUST short-
 * circuit BEFORE it has to resolve the org for an unknown sender.
 */
@Injectable()
export class WhatsappMessageRepository {
  constructor(
    @InjectRepository(WhatsappMessage)
    private readonly typeormRepo: Repository<WhatsappMessage>,
  ) {}

  async save(item: WhatsappMessage): Promise<WhatsappMessage> {
    return this.typeormRepo.save(item);
  }

  /**
   * Idempotency lookup. Returns the existing row if Meta re-delivered
   * the same message (their default behaviour when the receiver does
   * not 200 within ~5 s). The controller treats a non-null result as
   * "already persisted, ack and exit".
   */
  async findByProviderMessageId(
    providerMessageId: string,
  ): Promise<WhatsappMessage | null> {
    return this.typeormRepo.findOne({ where: { providerMessageId } });
  }

  async findById(
    organizationId: string,
    id: string,
  ): Promise<WhatsappMessage | null> {
    return this.typeormRepo.findOne({ where: { id, organizationId } });
  }

  async listByStatus(
    organizationId: string,
    status: WhatsappMessageStatus,
    limit: number,
  ): Promise<WhatsappMessage[]> {
    return this.typeormRepo.find({
      where: { organizationId, status },
      order: { receivedAt: 'DESC' },
      take: limit,
    });
  }
}
