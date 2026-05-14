import type { Repository } from 'typeorm';
import { CcpReading } from '../domain/ccp-reading.entity';
import { RecentReadingsQuery } from './recent-readings.query';

const ORG = '11111111-1111-4111-8111-111111111111';

describe('RecentReadingsQuery', () => {
  let repo: jest.Mocked<Pick<Repository<CcpReading>, 'find'>>;
  let q: RecentReadingsQuery;

  beforeEach(() => {
    repo = {
      find: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<Pick<Repository<CcpReading>, 'find'>>;
    q = new RecentReadingsQuery(repo as unknown as Repository<CcpReading>);
  });

  it('applies the default limit of 5 + DESC order + tenant scope', async () => {
    await q.recentReadings(ORG, 'cooler-meat-fridge');
    expect(repo.find).toHaveBeenCalledTimes(1);
    const opts = repo.find.mock.calls[0][0]!;
    expect((opts as { where: Record<string, unknown> }).where.organizationId).toBe(
      ORG,
    );
    expect((opts as { where: Record<string, unknown> }).where.ccpId).toBe(
      'cooler-meat-fridge',
    );
    expect((opts as { order: Record<string, unknown> }).order.createdAt).toBe('DESC');
    expect((opts as { take: number }).take).toBe(5);
  });

  it('caps the limit at 50', async () => {
    await q.recentReadings(ORG, 'cooler-meat-fridge', 9999);
    const opts = repo.find.mock.calls[0][0]!;
    expect((opts as { take: number }).take).toBe(50);
  });

  it('floors the limit to at least 1', async () => {
    await q.recentReadings(ORG, 'cooler-meat-fridge', 0);
    const opts = repo.find.mock.calls[0][0]!;
    expect((opts as { take: number }).take).toBe(1);
  });
});
