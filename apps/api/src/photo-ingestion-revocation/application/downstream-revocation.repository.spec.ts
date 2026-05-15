import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { DownstreamRevocationRepository } from './downstream-revocation.repository';

const ORG = '11111111-1111-4111-8111-111111111111';
const ITEM = '22222222-2222-4222-8222-222222222222';

function buildRepo() {
  const dataSource = {
    query: jest.fn(),
  } as unknown as jest.Mocked<Pick<DataSource, 'query'>>;
  const repo = new DownstreamRevocationRepository(
    dataSource as unknown as DataSource,
  );
  return { repo, dataSource };
}

describe('DownstreamRevocationRepository.flagLotsBySourcePhotoIngestion', () => {
  it('returns flagged row ids when column exists + match found', async () => {
    const { repo, dataSource } = buildRepo();
    (dataSource.query as jest.Mock).mockResolvedValue([
      { id: 'lot-1' },
      { id: 'lot-2' },
    ]);

    const result = await repo.flagLotsBySourcePhotoIngestion(ORG, ITEM);

    expect(result).toEqual({
      columnExists: true,
      flaggedRowIds: ['lot-1', 'lot-2'],
    });
    expect(dataSource.query).toHaveBeenCalledTimes(1);
    const [sql, params] = (dataSource.query as jest.Mock).mock.calls[0]!;
    expect(sql).toMatch(/UPDATE "lots"/);
    expect(sql).toMatch(/requires_review/);
    expect(sql).toMatch(/source_photo_ingestion_id/);
    expect(sql).toMatch(/RETURNING "id"/);
    expect(params).toEqual([ORG, ITEM]);
  });

  it('returns empty when column exists + no match', async () => {
    const { repo, dataSource } = buildRepo();
    (dataSource.query as jest.Mock).mockResolvedValue([]);

    const result = await repo.flagLotsBySourcePhotoIngestion(ORG, ITEM);

    expect(result).toEqual({ columnExists: true, flaggedRowIds: [] });
  });

  it('returns columnExists=false on Postgres 42703 (top-level code)', async () => {
    const { repo, dataSource } = buildRepo();
    const pgErr: Error & { code?: string } = Object.assign(
      new Error('column does not exist'),
      { code: '42703' },
    );
    (dataSource.query as jest.Mock).mockRejectedValue(pgErr);

    const result = await repo.flagLotsBySourcePhotoIngestion(ORG, ITEM);

    expect(result).toEqual({ columnExists: false });
  });

  it('returns columnExists=false on Postgres 42703 nested under driverError', async () => {
    const { repo, dataSource } = buildRepo();
    const driverErr = { code: '42703' };
    const pgErr = Object.assign(new Error('wrap'), { driverError: driverErr });
    (dataSource.query as jest.Mock).mockRejectedValue(pgErr);

    const result = await repo.flagLotsBySourcePhotoIngestion(ORG, ITEM);

    expect(result).toEqual({ columnExists: false });
  });

  it('re-raises non-42703 errors', async () => {
    const { repo, dataSource } = buildRepo();
    (dataSource.query as jest.Mock).mockRejectedValue(
      new Error('connection lost'),
    );

    await expect(
      repo.flagLotsBySourcePhotoIngestion(ORG, ITEM),
    ).rejects.toThrow(/connection lost/);
  });
});

describe('DownstreamRevocationRepository.flagGoodsReceiptsBySourcePhotoIngestion', () => {
  it('targets goods_receipts table + same param order', async () => {
    const { repo, dataSource } = buildRepo();
    (dataSource.query as jest.Mock).mockResolvedValue([{ id: 'gr-1' }]);

    const result = await repo.flagGoodsReceiptsBySourcePhotoIngestion(ORG, ITEM);

    expect(result).toEqual({ columnExists: true, flaggedRowIds: ['gr-1'] });
    const [sql, params] = (dataSource.query as jest.Mock).mock.calls[0]!;
    expect(sql).toMatch(/UPDATE "goods_receipts"/);
    expect(params).toEqual([ORG, ITEM]);
  });

  it('handles 42703 the same way as the lots probe', async () => {
    const { repo, dataSource } = buildRepo();
    (dataSource.query as jest.Mock).mockRejectedValue({ code: '42703' });

    const result = await repo.flagGoodsReceiptsBySourcePhotoIngestion(ORG, ITEM);

    expect(result).toEqual({ columnExists: false });
  });
});
