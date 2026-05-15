import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { ReviewQueueRepository } from './review-queue.repository';

const ORG = '11111111-1111-4111-8111-111111111111';
const LOT = '22222222-2222-4222-8222-222222222222';
const GR = '33333333-3333-4333-8333-333333333333';
const PHOTO = '44444444-4444-4444-8444-444444444444';

function buildRepo() {
  const dataSource = {
    query: jest.fn(),
  } as unknown as jest.Mocked<Pick<DataSource, 'query'>>;
  const repo = new ReviewQueueRepository(dataSource as unknown as DataSource);
  return { repo, dataSource };
}

describe('ReviewQueueRepository.listFlagged', () => {
  it('returns rows from both tables newest-first when no aggregateType filter is supplied', async () => {
    const { repo, dataSource } = buildRepo();
    const lotRow = {
      aggregate_id: LOT,
      organization_id: ORG,
      source_photo_ingestion_id: PHOTO,
      received_at: new Date('2026-05-10T10:00:00.000Z'),
      location_id: 'loc-1',
      supplier_id: 'sup-1',
      unit: 'kg',
      flagged_at: new Date('2026-05-15T12:00:00.000Z'),
    };
    const grRow = {
      aggregate_id: GR,
      organization_id: ORG,
      source_photo_ingestion_id: PHOTO,
      received_at: new Date('2026-05-11T10:00:00.000Z'),
      supplier_id: 'sup-1',
      supplier_invoice_ref: 'INV-001',
      received_at_location_id: 'loc-2',
      flagged_at: new Date('2026-05-15T14:00:00.000Z'),
    };
    (dataSource.query as jest.Mock)
      .mockResolvedValueOnce([lotRow])
      .mockResolvedValueOnce([grRow]);

    const result = await repo.listFlagged(ORG);

    expect(result.truncated).toBe(false);
    expect(result.rows).toHaveLength(2);
    // GR row is newer → first.
    expect(result.rows[0]!.aggregateType).toBe('goods_receipt');
    expect(result.rows[0]!.aggregateId).toBe(GR);
    expect(result.rows[1]!.aggregateType).toBe('lot');
    expect(result.rows[1]!.flaggedAt).toBe('2026-05-15T12:00:00.000Z');
  });

  it('truncates when merged result strictly exceeds the requested limit', async () => {
    const { repo, dataSource } = buildRepo();
    const lotRows = Array.from({ length: 3 }, (_, i) => ({
      aggregate_id: `lot-${i}`,
      organization_id: ORG,
      source_photo_ingestion_id: PHOTO,
      received_at: new Date('2026-05-10T10:00:00.000Z'),
      location_id: 'loc-1',
      supplier_id: null,
      unit: 'kg',
      flagged_at: new Date(`2026-05-15T1${i}:00:00.000Z`),
    }));
    (dataSource.query as jest.Mock)
      .mockResolvedValueOnce(lotRows)
      .mockResolvedValueOnce([]);

    const result = await repo.listFlagged(ORG, { limit: 2 });

    expect(result.truncated).toBe(true);
    expect(result.rows).toHaveLength(2);
  });

  it('skips the GR query when aggregateType=lot', async () => {
    const { repo, dataSource } = buildRepo();
    (dataSource.query as jest.Mock).mockResolvedValueOnce([]);
    await repo.listFlagged(ORG, { aggregateType: 'lot' });
    expect(dataSource.query).toHaveBeenCalledTimes(1);
  });

  it('skips the Lot query when aggregateType=goods_receipt', async () => {
    const { repo, dataSource } = buildRepo();
    (dataSource.query as jest.Mock).mockResolvedValueOnce([]);
    await repo.listFlagged(ORG, { aggregateType: 'goods_receipt' });
    expect(dataSource.query).toHaveBeenCalledTimes(1);
  });

  it('returns empty rows when both tables return 42703 (column missing — pre-migration deployment)', async () => {
    const { repo, dataSource } = buildRepo();
    const pgErr = Object.assign(new Error('column missing'), { code: '42703' });
    (dataSource.query as jest.Mock).mockRejectedValueOnce(pgErr);
    (dataSource.query as jest.Mock).mockRejectedValueOnce(pgErr);

    const result = await repo.listFlagged(ORG);

    expect(result).toEqual({ rows: [], truncated: false });
  });
});

describe('ReviewQueueRepository.clearLotReview', () => {
  it('returns cleared:true alreadyClear:false when row was flagged', async () => {
    const { repo, dataSource } = buildRepo();
    (dataSource.query as jest.Mock).mockResolvedValue([
      { was_flagged: true, source_photo_ingestion_id: PHOTO },
    ]);

    const result = await repo.clearLotReview(ORG, LOT);

    expect(result).toEqual({
      cleared: true,
      alreadyClear: false,
      sourcePhotoIngestionId: PHOTO,
    });
    const [sql, params] = (dataSource.query as jest.Mock).mock.calls[0]!;
    expect(sql).toMatch(/UPDATE "lots"/);
    expect(sql).toMatch(/requires_review.*=.*false/s);
    expect(params).toEqual([LOT, ORG]);
  });

  it('returns alreadyClear:true when row exists but was already false (no envelope path)', async () => {
    const { repo, dataSource } = buildRepo();
    (dataSource.query as jest.Mock).mockResolvedValue([
      { was_flagged: false, source_photo_ingestion_id: PHOTO },
    ]);

    const result = await repo.clearLotReview(ORG, LOT);

    expect(result).toEqual({
      cleared: true,
      alreadyClear: true,
      sourcePhotoIngestionId: PHOTO,
    });
  });

  it('returns alreadyClear:true for missing row (cross-tenant or unknown id — ADR-NO-EXISTENCE-DISCLOSURE)', async () => {
    const { repo, dataSource } = buildRepo();
    (dataSource.query as jest.Mock).mockResolvedValue([]);

    const result = await repo.clearLotReview(ORG, LOT);

    expect(result).toEqual({
      cleared: true,
      alreadyClear: true,
      sourcePhotoIngestionId: null,
    });
  });

  it('returns alreadyClear:true on Postgres 42703 (pre-migration deployment)', async () => {
    const { repo, dataSource } = buildRepo();
    const pgErr = Object.assign(new Error('column missing'), { code: '42703' });
    (dataSource.query as jest.Mock).mockRejectedValue(pgErr);

    const result = await repo.clearLotReview(ORG, LOT);

    expect(result).toEqual({
      cleared: true,
      alreadyClear: true,
      sourcePhotoIngestionId: null,
    });
  });

  it('re-raises non-42703 errors', async () => {
    const { repo, dataSource } = buildRepo();
    (dataSource.query as jest.Mock).mockRejectedValue(new Error('connection lost'));

    await expect(repo.clearLotReview(ORG, LOT)).rejects.toThrow(
      'connection lost',
    );
  });
});

describe('ReviewQueueRepository.clearGrReview', () => {
  it('returns cleared:true alreadyClear:false when row was flagged', async () => {
    const { repo, dataSource } = buildRepo();
    (dataSource.query as jest.Mock).mockResolvedValue([
      { was_flagged: true, source_photo_ingestion_id: PHOTO },
    ]);

    const result = await repo.clearGrReview(ORG, GR);

    expect(result).toEqual({
      cleared: true,
      alreadyClear: false,
      sourcePhotoIngestionId: PHOTO,
    });
    const [sql] = (dataSource.query as jest.Mock).mock.calls[0]!;
    expect(sql).toMatch(/UPDATE "goods_receipts"/);
  });
});

describe('ReviewQueueRepository.findStaleAggregatesGroupedByOrg', () => {
  const ORG_A = '55555555-5555-4555-8555-555555555555';
  const ORG_B = '66666666-6666-4666-8666-666666666666';
  const LOT_A = '77777777-7777-4777-8777-777777777777';
  const LOT_B = '88888888-8888-4888-8888-888888888888';
  const GR_A = '99999999-9999-4999-8999-999999999999';

  it('groups stale rows by organizationId across lots + GRs, oldest-first within each group', async () => {
    const { repo, dataSource } = buildRepo();
    (dataSource.query as jest.Mock)
      .mockResolvedValueOnce([
        {
          organization_id: ORG_A,
          aggregate_id: LOT_A,
          source_photo_ingestion_id: PHOTO,
          flagged_at: new Date('2026-05-01T08:00:00.000Z'),
        },
        {
          organization_id: ORG_B,
          aggregate_id: LOT_B,
          source_photo_ingestion_id: null,
          flagged_at: new Date('2026-05-03T08:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([
        {
          organization_id: ORG_A,
          aggregate_id: GR_A,
          source_photo_ingestion_id: PHOTO,
          flagged_at: new Date('2026-05-02T08:00:00.000Z'),
        },
      ]);

    const result = await repo.findStaleAggregatesGroupedByOrg(7);

    expect(result).toHaveLength(2);
    const orgA = result.find((g) => g.organizationId === ORG_A)!;
    expect(orgA.rows).toHaveLength(2);
    // Oldest-first within org → LOT_A (May 1) before GR_A (May 2).
    expect(orgA.rows[0]!.aggregateType).toBe('lot');
    expect(orgA.rows[0]!.aggregateId).toBe(LOT_A);
    expect(orgA.rows[1]!.aggregateType).toBe('goods_receipt');
    expect(orgA.rows[1]!.aggregateId).toBe(GR_A);
    const orgB = result.find((g) => g.organizationId === ORG_B)!;
    expect(orgB.rows).toHaveLength(1);
    expect(orgB.rows[0]!.aggregateId).toBe(LOT_B);
  });

  it('returns [] when both tables are empty after the threshold filter', async () => {
    const { repo, dataSource } = buildRepo();
    (dataSource.query as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const result = await repo.findStaleAggregatesGroupedByOrg(7);
    expect(result).toEqual([]);
  });

  it('caps rows per organization at REVIEW_QUEUE_STALE_MAX_ROWS_PER_ORG (oldest retained)', async () => {
    const { repo, dataSource } = buildRepo();
    // 105 lot rows for ORG_A, all stale, with distinct ascending flagged_at.
    const manyLots = Array.from({ length: 105 }, (_, i) => ({
      organization_id: ORG_A,
      aggregate_id: `lot-${String(i).padStart(3, '0')}`,
      source_photo_ingestion_id: null,
      flagged_at: new Date(`2026-04-${String((i % 28) + 1).padStart(2, '0')}T0${i % 10}:00:00.000Z`),
    }));
    (dataSource.query as jest.Mock)
      .mockResolvedValueOnce(manyLots)
      .mockResolvedValueOnce([]);

    const result = await repo.findStaleAggregatesGroupedByOrg(7);

    expect(result).toHaveLength(1);
    expect(result[0]!.rows).toHaveLength(100);
    // After sort + slice(0, 100), the first row is the chronologically oldest
    // flagged_at across all 105 fixtures.
    const allFlaggedAt = manyLots.map((r) => r.flagged_at.toISOString()).sort();
    expect(result[0]!.rows[0]!.flaggedAt).toBe(allFlaggedAt[0]);
  });

  it('rejects invalid thresholdDays before issuing any query', async () => {
    const { repo, dataSource } = buildRepo();
    await expect(repo.findStaleAggregatesGroupedByOrg(0)).rejects.toThrow(
      /thresholdDays/,
    );
    await expect(
      repo.findStaleAggregatesGroupedByOrg(Number.NaN),
    ).rejects.toThrow(/thresholdDays/);
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('returns [] gracefully when migration 0041 not yet applied (42703 on lots probe)', async () => {
    const { repo, dataSource } = buildRepo();
    const err = { code: '42703' };
    (dataSource.query as jest.Mock).mockRejectedValueOnce(err).mockResolvedValueOnce([]);
    const result = await repo.findStaleAggregatesGroupedByOrg(7);
    expect(result).toEqual([]);
  });
});
