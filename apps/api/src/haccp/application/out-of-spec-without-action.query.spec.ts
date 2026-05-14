import type { Repository } from 'typeorm';
import { CcpReading } from '../domain/ccp-reading.entity';
import { OutOfSpecWithoutActionQuery } from './out-of-spec-without-action.query';

const ORG = '11111111-1111-4111-8111-111111111111';

describe('OutOfSpecWithoutActionQuery', () => {
  let repo: jest.Mocked<Pick<Repository<CcpReading>, 'findOne'>>;
  let q: OutOfSpecWithoutActionQuery;

  beforeEach(() => {
    repo = {
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Pick<Repository<CcpReading>, 'findOne'>>;
    q = new OutOfSpecWithoutActionQuery(
      repo as unknown as Repository<CcpReading>,
    );
  });

  it('returns the most-recent unresolved out-of-spec reading', async () => {
    const row = { id: 'r1' } as CcpReading;
    repo.findOne.mockResolvedValue(row);
    const got = await q.lastOutOfSpecUnresolved(ORG, 'cooler-meat-fridge');
    expect(got).toBe(row);
    const opts = repo.findOne.mock.calls[0][0]!;
    const where = (opts as { where: Record<string, unknown> }).where;
    expect(where.organizationId).toBe(ORG);
    expect(where.ccpId).toBe('cooler-meat-fridge');
    expect(where.inSpec).toBe(false);
    expect((opts as { order: Record<string, unknown> }).order.createdAt).toBe('DESC');
  });

  it('returns null when no row matches', async () => {
    repo.findOne.mockResolvedValue(null);
    const got = await q.lastOutOfSpecUnresolved(ORG, 'cooler-meat-fridge');
    expect(got).toBeNull();
  });
});
