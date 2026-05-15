import type { ObjectLiteral, Repository } from 'typeorm';
import { ExportBundle } from '../domain/export-bundle.entity';
import { BundleArchiveQuery } from './bundle-archive.query';

const ORG = '11111111-1111-4111-8111-111111111111';

function makeRow(overrides: Partial<ExportBundle> = {}): ExportBundle {
  const row = new ExportBundle();
  row.id = overrides.id ?? 'b1';
  row.organizationId = overrides.organizationId ?? ORG;
  row.requestedByUserId = overrides.requestedByUserId ?? 'u1';
  row.rangeStart = overrides.rangeStart ?? new Date('2026-02-01T00:00:00Z');
  row.rangeEnd = overrides.rangeEnd ?? new Date('2026-04-30T23:59:59Z');
  row.locale = overrides.locale ?? 'es-ES';
  row.scope = overrides.scope ?? ['haccp', 'lot'];
  row.status = overrides.status ?? 'ready';
  row.sha256 = overrides.sha256 ?? 'a'.repeat(64);
  row.pageCount = overrides.pageCount ?? 48;
  row.byteSize = overrides.byteSize ?? 2_300_000;
  row.generatedAt =
    overrides.generatedAt === undefined
      ? new Date('2026-05-01T14:32:00Z')
      : overrides.generatedAt;
  row.archivedAt = overrides.archivedAt ?? null;
  row.deletedAt = overrides.deletedAt ?? null;
  row.createdAt = overrides.createdAt ?? new Date('2026-05-01T14:00:00Z');
  return row;
}

function makeFakeRepo<T extends ObjectLiteral>(rows: T[]): Repository<T> {
  const findCalls: unknown[] = [];
  const repo = {
    find: jest.fn(async (options) => {
      findCalls.push(options);
      return rows;
    }),
  } as unknown as Repository<T> & { _findCalls: unknown[] };
  (repo as unknown as { _findCalls: unknown[] })._findCalls = findCalls;
  return repo;
}

describe('BundleArchiveQuery.recentBundles', () => {
  it('orders DESC by createdAt and clamps limit to the [1, 100] band', async () => {
    const repo = makeFakeRepo<ExportBundle>([makeRow()]);
    const query = new BundleArchiveQuery(repo);
    await query.recentBundles(ORG, 7);
    expect(repo.find).toHaveBeenCalledWith({
      where: expect.objectContaining({ organizationId: ORG }),
      order: { createdAt: 'DESC', id: 'DESC' },
      take: 7,
    });
  });

  it('uses default limit 10 when none is supplied', async () => {
    const repo = makeFakeRepo<ExportBundle>([]);
    const query = new BundleArchiveQuery(repo);
    await query.recentBundles(ORG);
    expect(repo.find).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10 }),
    );
  });

  it('clamps limit to 100 max', async () => {
    const repo = makeFakeRepo<ExportBundle>([]);
    const query = new BundleArchiveQuery(repo);
    await query.recentBundles(ORG, 9999);
    expect(repo.find).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    );
  });

  it('maps row → BundleArchiveRow with ISO timestamps', async () => {
    const repo = makeFakeRepo<ExportBundle>([
      makeRow({
        scope: ['haccp', 'lot', 'procurement'],
        locale: 'eu-ES',
      }),
    ]);
    const query = new BundleArchiveQuery(repo);
    const rows = await query.recentBundles(ORG, 1);
    expect(rows[0].locale).toBe('eu-ES');
    expect(rows[0].scope).toEqual(['haccp', 'lot', 'procurement']);
    expect(rows[0].generatedAt).toBe('2026-05-01T14:32:00.000Z');
    expect(rows[0].rangeStart).toBe('2026-02-01T00:00:00.000Z');
  });
});
