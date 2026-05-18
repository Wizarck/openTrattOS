import { createHmac } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { WhatsappMessage } from '../domain/whatsapp-message.entity';
import { WhatsappMessageRepository } from '../infrastructure/whatsapp-message.repository';
import { WhatsappIngestService } from '../application/whatsapp-ingest.service';
import { WhatsappWebhookController } from './whatsapp-webhook.controller';

const SECRET = 'test-secret';
const DEFAULT_ORG = '11111111-1111-4111-8111-111111111111';

function sign(buf: Buffer, secret: string = SECRET): string {
  return `sha256=${createHmac('sha256', secret).update(buf).digest('hex')}`;
}

function buildPayload(messageId: string = 'wamid.test-001'): string {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'biz-1',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                phone_number_id: '12345',
                display_phone_number: '34666999000',
              },
              messages: [
                {
                  id: messageId,
                  from: '34612345678',
                  timestamp: '1716060000',
                  type: 'text',
                  text: { body: 'Risotto de setas, 400g champiñones, 200g arroz' },
                },
              ],
            },
          },
        ],
      },
    ],
  });
}

function buildReq(body: string): RawBodyRequest<Request> {
  // The header lives on the controller param, not on req — but Meta's
  // raw body is the canonical surface we sign + read here.
  return {
    rawBody: Buffer.from(body, 'utf8'),
  } as unknown as RawBodyRequest<Request>;
}

function buildController(): {
  controller: WhatsappWebhookController;
  repo: jest.Mocked<Pick<WhatsappMessageRepository, 'findByProviderMessageId' | 'save'>>;
  ingest: jest.Mocked<Pick<WhatsappIngestService, 'processMessage'>>;
  saved: WhatsappMessage[];
} {
  const saved: WhatsappMessage[] = [];
  const repo = {
    findByProviderMessageId: jest.fn(async () => null),
    save: jest.fn(async (m: WhatsappMessage) => {
      saved.push(m);
      return m;
    }),
  } as unknown as jest.Mocked<Pick<WhatsappMessageRepository, 'findByProviderMessageId' | 'save'>>;
  const ingest = {
    processMessage: jest.fn(async () => ({
      messageId: 'x',
      status: 'parsed' as const,
      parsedRecipeId: null,
      errorMessage: null,
    })),
  } as unknown as jest.Mocked<Pick<WhatsappIngestService, 'processMessage'>>;
  const controller = new WhatsappWebhookController(
    repo as unknown as WhatsappMessageRepository,
    ingest as unknown as WhatsappIngestService,
  );
  return { controller, repo, ingest, saved };
}

describe('WhatsappWebhookController', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      WHATSAPP_WEBHOOK_SECRET: SECRET,
      WHATSAPP_DEFAULT_ORGANIZATION_ID: DEFAULT_ORG,
    };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('persists a valid signed message and returns 200 with counts', async () => {
    const { controller, repo, saved } = buildController();
    const body = buildPayload();
    const req = buildReq(body);
    const res = await controller.receive(req, sign(Buffer.from(body)));

    expect(res).toEqual({ received: true, persisted: 1, skipped: 0 });
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(saved[0].providerMessageId).toBe('wamid.test-001');
    expect(saved[0].fromNumber).toBe('+34612345678');
    expect(saved[0].body).toContain('Risotto');
    expect(saved[0].organizationId).toBe(DEFAULT_ORG);
  });

  it('rejects an invalid signature with 401', async () => {
    const { controller } = buildController();
    const body = buildPayload();
    const req = buildReq(body);
    await expect(
      controller.receive(req, sign(Buffer.from(body), 'WRONG-SECRET')),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects when WHATSAPP_WEBHOOK_SECRET is unset', async () => {
    delete process.env.WHATSAPP_WEBHOOK_SECRET;
    const { controller } = buildController();
    const body = buildPayload();
    const req = buildReq(body);
    await expect(controller.receive(req, sign(Buffer.from(body)))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects when rawBody is missing (Nest not configured with rawBody:true)', async () => {
    const { controller } = buildController();
    const req = { rawBody: undefined } as unknown as RawBodyRequest<Request>;
    await expect(controller.receive(req, 'sha256=anything')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('idempotency: skips Meta-redelivered messages with the same wamid', async () => {
    const { controller, repo, saved } = buildController();
    repo.findByProviderMessageId.mockResolvedValueOnce({
      id: 'existing',
      providerMessageId: 'wamid.test-001',
    } as unknown as WhatsappMessage);

    const body = buildPayload();
    const req = buildReq(body);
    const res = await controller.receive(req, sign(Buffer.from(body)));

    expect(res).toEqual({ received: true, persisted: 0, skipped: 1 });
    expect(saved).toHaveLength(0);
  });

  it('returns 200 (no retry) on signed-but-non-JSON body so Meta does not loop', async () => {
    const { controller, repo } = buildController();
    const body = 'not-json-at-all';
    const req = buildReq(body);
    const res = await controller.receive(req, sign(Buffer.from(body)));
    expect(res).toEqual({ received: true, persisted: 0, skipped: 0 });
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('skips messages when WHATSAPP_DEFAULT_ORGANIZATION_ID is unset (logs only)', async () => {
    delete process.env.WHATSAPP_DEFAULT_ORGANIZATION_ID;
    const { controller, repo } = buildController();
    const body = buildPayload();
    const req = buildReq(body);
    const res = await controller.receive(req, sign(Buffer.from(body)));
    expect(res).toEqual({ received: true, persisted: 0, skipped: 1 });
    expect(repo.save).not.toHaveBeenCalled();
  });
});
