// ============================================================
// InventoryCostResolverServiceM3 — unit tests (mocked repos)
// ============================================================

import { InventoryCostResolverServiceM3 } from './inventory-cost-resolver.service';
import { LotRepository } from '../../inventory/lot/application/lot.repository';
import { PreferredSupplierResolver } from './preferred-supplier.resolver';
import { Lot } from '../../inventory/lot/domain/lot.entity';
import { InsufficientInventoryError } from '../domain/errors';

const ORG = 'org-1';
const LOC = 'loc-1';
const PRODUCT = 'product-1';

function lotEntity(
  id: string,
  receivedAt: string,
  qtyRemaining: number,
  unitCost: number,
  expiresAt: string | null = null,
): Lot {
  const e = new Lot();
  e.id = id;
  e.organizationId = ORG;
  e.locationId = LOC;
  e.supplierId = null;
  e.receivedAt = new Date(receivedAt);
  e.expiresAt = expiresAt ? new Date(expiresAt) : null;
  e.quantityReceived = qtyRemaining;
  e.quantityRemaining = qtyRemaining;
  e.unit = 'kg';
  e.metadata = {
    product_id: PRODUCT,
    unit_cost_at_received: unitCost,
    currency: 'EUR',
  };
  return e;
}

function makeLotRepoMock(lots: Lot[]): LotRepository {
  return {
    findAvailableFifo: jest.fn().mockResolvedValue(lots),
  } as unknown as LotRepository;
}

describe('InventoryCostResolverServiceM3 — resolveCost', () => {
  it('defaults to FIFO when no strategyOverride is provided', async () => {
    const repo = makeLotRepoMock([
      lotEntity('L1', '2026-05-01', 3, 2.5),
      lotEntity('L2', '2026-05-02', 10, 3),
    ]);
    const service = new InventoryCostResolverServiceM3(repo);
    const result = await service.resolveCost({
      organizationId: ORG,
      locationId: LOC,
      productId: PRODUCT,
      quantity: 5,
      asOfTime: new Date('2026-05-15T00:00:00Z'),
    });

    expect(result.strategy).toBe('FIFO');
    expect(result.totalCost).toBe(13.5);
    expect(result.breakdown).toHaveLength(2);
  });

  it('honours strategyOverride=FEFO', async () => {
    const repo = makeLotRepoMock([
      lotEntity('A', '2026-05-01', 10, 2.5, '2026-06-15'),
      lotEntity('B', '2026-05-03', 10, 3, '2026-06-01'),
    ]);
    const service = new InventoryCostResolverServiceM3(repo);
    const result = await service.resolveCost({
      organizationId: ORG,
      locationId: LOC,
      productId: PRODUCT,
      quantity: 5,
      asOfTime: new Date('2026-05-15T00:00:00Z'),
      strategyOverride: 'FEFO',
    });

    expect(result.strategy).toBe('FEFO');
    expect(result.breakdown[0].lotId).toBe('B');
  });

  it('filters lots whose metadata product_id does not match', async () => {
    const lotForOther = lotEntity('L-other', '2026-05-01', 100, 1);
    lotForOther.metadata = {
      product_id: 'product-OTHER',
      unit_cost_at_received: 1,
      currency: 'EUR',
    };
    const repo = makeLotRepoMock([
      lotForOther,
      lotEntity('L1', '2026-05-02', 5, 2),
    ]);
    const service = new InventoryCostResolverServiceM3(repo);
    const result = await service.resolveCost({
      organizationId: ORG,
      locationId: LOC,
      productId: PRODUCT,
      quantity: 5,
      asOfTime: new Date('2026-05-15T00:00:00Z'),
    });

    expect(result.breakdown).toHaveLength(1);
    expect(result.breakdown[0].lotId).toBe('L1');
  });

  it('propagates InsufficientInventoryError on global shortage', async () => {
    const repo = makeLotRepoMock([lotEntity('L1', '2026-05-01', 3, 2)]);
    const service = new InventoryCostResolverServiceM3(repo);
    await expect(
      service.resolveCost({
        organizationId: ORG,
        locationId: LOC,
        productId: PRODUCT,
        quantity: 10,
        asOfTime: new Date('2026-05-15T00:00:00Z'),
      }),
    ).rejects.toBeInstanceOf(InsufficientInventoryError);
  });

  it('passes organizationId / locationId / asOfTime through to the repository', async () => {
    const repo = makeLotRepoMock([lotEntity('L1', '2026-05-01', 10, 2)]);
    const service = new InventoryCostResolverServiceM3(repo);
    const asOf = new Date('2026-05-15T12:00:00Z');
    await service.resolveCost({
      organizationId: ORG,
      locationId: LOC,
      productId: PRODUCT,
      quantity: 1,
      asOfTime: asOf,
    });

    const fn = repo.findAvailableFifo as jest.Mock;
    expect(fn).toHaveBeenCalledWith(ORG, LOC, asOf);
  });

  it('delegates to PreferredSupplierResolver when strategyOverride=MANUAL', async () => {
    const repo = makeLotRepoMock([]);
    const m2 = {
      resolveBaseCost: jest.fn().mockResolvedValue({
        costPerBaseUnit: 4.5,
        currency: 'EUR',
        source: {
          kind: 'supplier-item',
          refId: 'si-1',
          displayLabel: 'Vendor — 1 kg',
        },
      }),
    } as unknown as PreferredSupplierResolver;
    const service = new InventoryCostResolverServiceM3(repo, m2);
    const result = await service.resolveCost({
      organizationId: ORG,
      locationId: LOC,
      productId: PRODUCT,
      quantity: 3,
      asOfTime: new Date('2026-05-15T00:00:00Z'),
      strategyOverride: 'MANUAL',
    });

    expect(result.strategy).toBe('MANUAL');
    expect(result.totalCost).toBe(13.5);
    expect(result.breakdown[0].lotId).toBe('si-1');
    expect((m2.resolveBaseCost as jest.Mock).mock.calls.length).toBe(1);
  });
});

describe('InventoryCostResolverServiceM3 — purity invariants', () => {
  it('never calls a save / update / delete on the repository', async () => {
    const repo = {
      findAvailableFifo: jest
        .fn()
        .mockResolvedValue([lotEntity('L1', '2026-05-01', 10, 2)]),
      save: jest.fn(),
    } as unknown as LotRepository;
    const service = new InventoryCostResolverServiceM3(repo);
    await service.resolveCost({
      organizationId: ORG,
      locationId: LOC,
      productId: PRODUCT,
      quantity: 3,
      asOfTime: new Date('2026-05-15T00:00:00Z'),
    });
    expect((repo as unknown as { save: jest.Mock }).save).not.toHaveBeenCalled();
  });
});
