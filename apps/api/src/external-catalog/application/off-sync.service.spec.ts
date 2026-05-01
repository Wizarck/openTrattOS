import { ExternalFoodCatalog } from '../domain/external-food-catalog.entity';
import { ExternalFoodCatalogRepository } from '../infrastructure/external-food-catalog.repository';
import { FetchLike, OffApiOutageError } from './off-api.types';
import { OFF_LICENSE_ATTRIBUTION } from './off-product-mapper';
import { OffSyncService } from './off-sync.service';

interface RepoStub {
  findByBarcode: jest.Mock;
  save: jest.Mock;
  getSyncCursor: jest.Mock;
}

function buildRepoStub(): RepoStub {
  return {
    findByBarcode: jest.fn(),
    save: jest.fn(),
    getSyncCursor: jest.fn(),
  };
}

function asRepo(stub: RepoStub): ExternalFoodCatalogRepository {
  return stub as unknown as ExternalFoodCatalogRepository;
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const validProduct = (overrides: Record<string, unknown> = {}) => ({
  code: '111',
  product_name: 'Tomate',
  brands: 'Solis',
  nutriments: {},
  allergens_tags: [],
  labels_tags: [],
  last_modified_t: 1735689600,
  ...overrides,
});

describe('OffSyncService.syncRegion', () => {
  it('inserts new rows, advances cursor based on last_modified_t', async () => {
    const repo = buildRepoStub();
    repo.getSyncCursor.mockResolvedValueOnce(null);
    repo.findByBarcode.mockResolvedValue(null);
    repo.save.mockImplementation(async (r) => r);

    const fetcher: FetchLike = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          products: [
            validProduct({ code: 'A', last_modified_t: 1700000000 }),
            validProduct({ code: 'B', last_modified_t: 1735689600 }),
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ products: [] }));

    const service = new OffSyncService(asRepo(repo), fetcher);
    const result = await service.syncRegion('ES', { pageSize: 50, maxPages: 5 });

    expect(result.region).toBe('ES');
    expect(result.rowsUpserted).toBe(2);
    expect(result.rowsSkipped).toBe(0);
    expect(result.pagesFetched).toBe(2);
    expect(result.cursorAfter).toEqual(new Date(1735689600 * 1000));
  });

  it('updates existing rows in place via applyUpdate', async () => {
    const repo = buildRepoStub();
    repo.getSyncCursor.mockResolvedValueOnce(null);
    const existing = ExternalFoodCatalog.create({
      barcode: '111',
      name: 'Old name',
      brand: 'Old brand',
      nutrition: null,
      allergens: [],
      dietFlags: [],
      region: 'ES',
      lastModifiedAt: null,
      licenseAttribution: OFF_LICENSE_ATTRIBUTION,
    });
    repo.findByBarcode.mockResolvedValue(existing);
    repo.save.mockImplementation(async (r) => r);

    const fetcher: FetchLike = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          products: [validProduct({ code: '111', product_name: 'New name', brands: 'New brand' })],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ products: [] }));

    const service = new OffSyncService(asRepo(repo), fetcher);
    const result = await service.syncRegion('ES', { maxPages: 3 });

    expect(result.rowsUpserted).toBe(1);
    expect(existing.name).toBe('New name');
    expect(existing.brand).toBe('New brand');
  });

  it('skips malformed rows and counts them in rowsSkipped without aborting the page', async () => {
    const repo = buildRepoStub();
    repo.getSyncCursor.mockResolvedValueOnce(null);
    repo.findByBarcode.mockResolvedValue(null);
    repo.save.mockImplementation(async (r) => r);

    const fetcher: FetchLike = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          products: [
            { code: 'A', product_name: 'Good' },
            { code: 'B' /* missing product_name */ },
            { code: 'C', product_name: 'Also good' },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ products: [] }));

    const service = new OffSyncService(asRepo(repo), fetcher);
    const result = await service.syncRegion('ES', { maxPages: 3 });

    expect(result.rowsUpserted).toBe(2);
    expect(result.rowsSkipped).toBe(1);
  });

  it('throws OffApiOutageError on 5xx response', async () => {
    const repo = buildRepoStub();
    repo.getSyncCursor.mockResolvedValueOnce(null);
    const fetcher: FetchLike = jest.fn().mockResolvedValueOnce(jsonResponse({}, 503));
    const service = new OffSyncService(asRepo(repo), fetcher);

    await expect(service.syncRegion('ES')).rejects.toBeInstanceOf(OffApiOutageError);
  });

  it('throws OffApiOutageError on network error', async () => {
    const repo = buildRepoStub();
    repo.getSyncCursor.mockResolvedValueOnce(null);
    const fetcher: FetchLike = jest.fn().mockRejectedValueOnce(new Error('ETIMEDOUT'));
    const service = new OffSyncService(asRepo(repo), fetcher);

    await expect(service.syncRegion('ES')).rejects.toBeInstanceOf(OffApiOutageError);
  });

  it('passes the cursor query to the OFF URL when previous cursor exists', async () => {
    const repo = buildRepoStub();
    const cursor = new Date('2025-12-01T00:00:00Z');
    repo.getSyncCursor.mockResolvedValueOnce(cursor);
    repo.findByBarcode.mockResolvedValue(null);
    repo.save.mockImplementation(async (r) => r);
    const fetcher: FetchLike = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({ products: [] }));

    const service = new OffSyncService(asRepo(repo), fetcher);
    await service.syncRegion('IT', { pageSize: 25, maxPages: 1 });

    const calledUrl = (fetcher as jest.Mock).mock.calls[0][0] as string;
    expect(calledUrl).toContain('countries_tags_en=it');
    expect(calledUrl).toContain('page_size=25');
    expect(calledUrl).toContain(`last_modified_t=%3E${Math.floor(cursor.getTime() / 1000)}`);
  });
});

describe('OffSyncService.syncAll', () => {
  it('runs every region sequentially and refuses overlap', async () => {
    const repo = buildRepoStub();
    repo.getSyncCursor.mockResolvedValue(null);
    repo.findByBarcode.mockResolvedValue(null);
    repo.save.mockImplementation(async (r) => r);

    const fetcher: FetchLike = jest.fn().mockResolvedValue(jsonResponse({ products: [] }));
    const service = new OffSyncService(asRepo(repo), fetcher);

    const results = await service.syncAll({ regions: ['ES', 'IT'], maxPages: 1 });
    expect(results.map((r) => r.region)).toEqual(['ES', 'IT']);
  });
});
