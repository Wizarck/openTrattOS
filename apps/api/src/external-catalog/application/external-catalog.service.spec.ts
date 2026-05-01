import { ExternalFoodCatalog } from '../domain/external-food-catalog.entity';
import { ExternalFoodCatalogRepository } from '../infrastructure/external-food-catalog.repository';
import { ExternalCatalogService } from './external-catalog.service';
import { FetchLike, OffApiOutageError } from './off-api.types';
import { OFF_LICENSE_ATTRIBUTION } from './off-product-mapper';

interface RepoStub {
  findByBarcode: jest.Mock;
  searchByName: jest.Mock;
  searchByBrand: jest.Mock;
  save: jest.Mock;
}

function buildRepoStub(): RepoStub {
  return {
    findByBarcode: jest.fn(),
    searchByName: jest.fn(),
    searchByBrand: jest.fn(),
    save: jest.fn(),
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

const validRow = (): ExternalFoodCatalog =>
  ExternalFoodCatalog.create({
    barcode: '111',
    name: 'Pre-cached',
    brand: 'X',
    nutrition: null,
    allergens: [],
    dietFlags: [],
    region: 'ES',
    lastModifiedAt: null,
    licenseAttribution: OFF_LICENSE_ATTRIBUTION,
  });

describe('ExternalCatalogService.searchByBarcode', () => {
  it('cache hit: serves from local repo and skips OFF fetch entirely', async () => {
    const repo = buildRepoStub();
    const cached = validRow();
    repo.findByBarcode.mockResolvedValueOnce(cached);

    const fetcher: FetchLike = jest.fn();
    const service = new ExternalCatalogService(asRepo(repo), fetcher);

    const out = await service.searchByBarcode('111', { region: 'ES' });
    expect(out).toBe(cached);
    expect(fetcher).not.toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('cache miss + OFF success: persists row and returns it', async () => {
    const repo = buildRepoStub();
    repo.findByBarcode.mockResolvedValueOnce(null);
    repo.save.mockImplementation(async (r) => r);

    const fetcher: FetchLike = jest.fn().mockResolvedValueOnce(
      jsonResponse({
        status: 1,
        product: {
          code: '999',
          product_name: 'Tomate triturado',
          brands: 'Solis',
          nutriments: { 'energy-kcal_100g': 32 },
        },
      }),
    );

    const service = new ExternalCatalogService(asRepo(repo), fetcher);
    const out = await service.searchByBarcode('999', { region: 'ES' });

    expect(out?.barcode).toBe('999');
    expect(out?.name).toBe('Tomate triturado');
    expect(out?.region).toBe('ES');
    expect(out?.licenseAttribution).toBe(OFF_LICENSE_ATTRIBUTION);
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((fetcher as jest.Mock).mock.calls[0][0]).toMatch(/\/api\/v0\/product\/999\.json$/);
  });

  it('cache miss + OFF status:0: returns null without persisting', async () => {
    const repo = buildRepoStub();
    repo.findByBarcode.mockResolvedValueOnce(null);
    const fetcher: FetchLike = jest.fn().mockResolvedValueOnce(
      jsonResponse({ status: 0, status_verbose: 'product not found' }),
    );

    const service = new ExternalCatalogService(asRepo(repo), fetcher);
    const out = await service.searchByBarcode('does-not-exist', { region: 'ES' });

    expect(out).toBeNull();
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('cache miss + OFF 503 outage: degraded — returns null, logs warning, does NOT throw', async () => {
    const repo = buildRepoStub();
    repo.findByBarcode.mockResolvedValueOnce(null);
    const fetcher: FetchLike = jest.fn().mockResolvedValueOnce(jsonResponse({}, 503));

    const service = new ExternalCatalogService(asRepo(repo), fetcher);
    const out = await service.searchByBarcode('999', { region: 'ES' });

    expect(out).toBeNull();
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('cache miss + OFF network error: degraded — returns null', async () => {
    const repo = buildRepoStub();
    repo.findByBarcode.mockResolvedValueOnce(null);
    const fetcher: FetchLike = jest.fn().mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const service = new ExternalCatalogService(asRepo(repo), fetcher);
    const out = await service.searchByBarcode('999', { region: 'ES' });

    expect(out).toBeNull();
  });

  it('strict variant surfaces OffApiOutageError on 5xx for callers that want HTTP 503', async () => {
    const repo = buildRepoStub();
    repo.findByBarcode.mockResolvedValueOnce(null);
    const fetcher: FetchLike = jest.fn().mockResolvedValueOnce(jsonResponse({}, 502));

    const service = new ExternalCatalogService(asRepo(repo), fetcher);
    await expect(service.searchByBarcodeStrict('999', { region: 'ES' })).rejects.toBeInstanceOf(
      OffApiOutageError,
    );
  });
});

describe('ExternalCatalogService.searchByName / searchByBrand (region scoping)', () => {
  it('searchByName forwards region filter to repo', async () => {
    const repo = buildRepoStub();
    repo.searchByName.mockResolvedValueOnce([]);
    const service = new ExternalCatalogService(asRepo(repo), jest.fn());

    await service.searchByName('tomate', 'ES', 10);

    expect(repo.searchByName).toHaveBeenCalledWith('tomate', 'ES', 10);
  });

  it('searchByBrand forwards region filter to repo', async () => {
    const repo = buildRepoStub();
    repo.searchByBrand.mockResolvedValueOnce([]);
    const service = new ExternalCatalogService(asRepo(repo), jest.fn());

    await service.searchByBrand('Carbonell', 'ES');

    expect(repo.searchByBrand).toHaveBeenCalledWith('Carbonell', 'ES', undefined);
  });
});
