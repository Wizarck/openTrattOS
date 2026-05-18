import { WhatsappMessage } from '../domain/whatsapp-message.entity';
import { WhatsappMessageRepository } from '../infrastructure/whatsapp-message.repository';
import { ParseRecipeFromTextService } from './parse-recipe-from-text.service';
import { WhatsappIngestService } from './whatsapp-ingest.service';

const ORG = '11111111-1111-4111-8111-111111111111';

function buildMessage(body: string | null): WhatsappMessage {
  return WhatsappMessage.create({
    organizationId: ORG,
    providerMessageId: `wamid.${Math.random().toString(36).slice(2)}`,
    fromNumber: '+34612345678',
    body,
    receivedAt: new Date('2026-05-18T19:42:00Z'),
    rawPayload: null,
  });
}

function buildRepo(): jest.Mocked<Pick<WhatsappMessageRepository, 'save'>> {
  return {
    save: jest.fn(async (m: WhatsappMessage) => m),
  } as unknown as jest.Mocked<Pick<WhatsappMessageRepository, 'save'>>;
}

describe('WhatsappIngestService', () => {
  it('marks happy-path message as parsed and stashes parserOutput on rawPayload', async () => {
    const repo = buildRepo();
    const parser = new ParseRecipeFromTextService();
    const svc = new WhatsappIngestService(
      repo as unknown as WhatsappMessageRepository,
      parser,
    );
    const m = buildMessage('Risotto de setas, 400g champiñones, 200g arroz');

    const res = await svc.processMessage(m);

    expect(res.status).toBe('parsed');
    expect(res.parsedRecipeId).toBeNull(); // M2.x wires recipes BC
    expect(m.status).toBe('parsed');
    expect(repo.save).toHaveBeenCalledWith(m);
    expect(m.rawPayload).toMatchObject({
      parserOutput: { name: 'Risotto de setas' },
    });
  });

  it('marks unparseable bodies as failed', async () => {
    const repo = buildRepo();
    const parser = new ParseRecipeFromTextService();
    const svc = new WhatsappIngestService(
      repo as unknown as WhatsappMessageRepository,
      parser,
    );
    // First line is purely a quantity — parser returns null (no name).
    const m = buildMessage('400g champiñones');

    const res = await svc.processMessage(m);
    expect(res.status).toBe('failed');
    expect(m.status).toBe('failed');
    expect(m.errorMessage).toContain('parser');
  });

  it('marks non-text messages (body=null) as ignored with a clear reason', async () => {
    const repo = buildRepo();
    const parser = new ParseRecipeFromTextService();
    const svc = new WhatsappIngestService(
      repo as unknown as WhatsappMessageRepository,
      parser,
    );
    const m = buildMessage(null);

    const res = await svc.processMessage(m);
    expect(res.status).toBe('ignored');
    expect(m.status).toBe('ignored');
    expect(m.errorMessage).toContain('non-text');
  });

  it('is a no-op when called twice (idempotency through entity state)', async () => {
    const repo = buildRepo();
    const parser = new ParseRecipeFromTextService();
    const svc = new WhatsappIngestService(
      repo as unknown as WhatsappMessageRepository,
      parser,
    );
    const m = buildMessage('Risotto, 100g arroz');
    await svc.processMessage(m);
    const callsAfterFirst = repo.save.mock.calls.length;
    const res2 = await svc.processMessage(m);
    expect(res2.status).toBe('parsed');
    expect(repo.save.mock.calls.length).toBe(callsAfterFirst); // no extra save
  });
});
