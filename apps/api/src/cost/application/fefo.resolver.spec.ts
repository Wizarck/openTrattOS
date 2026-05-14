// ============================================================
// FEFO resolver — unit tests (boundary + algorithmic)
// ============================================================

import { resolveFefo, compareFefo } from './fefo.resolver';
import { LotCostRow } from '../domain/types';
import { InsufficientInventoryError } from '../domain/errors';

const ORG = 'org-1';
const LOC = 'loc-1';
const PRODUCT = 'product-1';
const ASOF = new Date('2026-05-15T00:00:00Z');
const CURRENCY = 'EUR';

function lot(
  id: string,
  receivedAt: string,
  qtyRemaining: number,
  unitCost: number,
  expiresAt: string | null = null,
): LotCostRow {
  return {
    id,
    organizationId: ORG,
    locationId: LOC,
    productId: PRODUCT,
    receivedAt: new Date(receivedAt),
    expiresAt: expiresAt ? new Date(expiresAt) : null,
    quantityRemaining: qtyRemaining,
    unitCostAtReceived: unitCost,
    currency: CURRENCY,
  };
}

describe('resolveFefo', () => {
  it('prefers earlier-expiry lot even when received later', () => {
    const rows = [
      lot('A', '2026-05-01', 10, 2.5, '2026-06-15'),
      lot('B', '2026-05-03', 10, 3.0, '2026-06-01'),
    ];
    const result = resolveFefo(rows, 5, CURRENCY, ASOF, ORG, PRODUCT);

    expect(result.strategy).toBe('FEFO');
    expect(result.totalCost).toBe(15);
    expect(result.breakdown[0]).toMatchObject({ lotId: 'B', qty: 5 });
    expect(result.remainingLots.find((r) => r.id === 'A')?.quantityRemaining).toBe(10);
    expect(result.remainingLots.find((r) => r.id === 'B')?.quantityRemaining).toBe(5);
  });

  it('pushes NULL expires_at LAST when dated lots are available', () => {
    const rows = [
      lot('null-1', '2026-05-01', 10, 2.5, null),
      lot('dated-1', '2026-05-03', 10, 3.0, '2026-06-15'),
    ];
    const result = resolveFefo(rows, 5, CURRENCY, ASOF, ORG, PRODUCT);
    expect(result.breakdown[0].lotId).toBe('dated-1');
  });

  it('breaks NULL-vs-NULL tie by receivedAt ASC then id', () => {
    const rows = [
      lot('z', '2026-05-03', 5, 4, null),
      lot('m', '2026-05-01', 5, 2, null),
      lot('a', '2026-05-01', 5, 3, null),
    ];
    const result = resolveFefo(rows, 12, CURRENCY, ASOF, ORG, PRODUCT);
    expect(result.breakdown.map((b) => b.lotId)).toEqual(['a', 'm', 'z']);
  });

  it('breaks same-expiry tie by receivedAt ASC', () => {
    const rows = [
      lot('late', '2026-05-03', 5, 3, '2026-06-01'),
      lot('early', '2026-05-01', 5, 2, '2026-06-01'),
    ];
    const result = resolveFefo(rows, 4, CURRENCY, ASOF, ORG, PRODUCT);
    expect(result.breakdown[0].lotId).toBe('early');
    expect(result.totalCost).toBe(8);
  });

  it('crosses the dated→NULL boundary when dated qty is exhausted', () => {
    const rows = [
      lot('null-1', '2026-05-02', 5, 2, null),
      lot('dated-1', '2026-05-01', 2, 3, '2026-06-15'),
    ];
    const result = resolveFefo(rows, 4, CURRENCY, ASOF, ORG, PRODUCT);
    expect(result.breakdown.map((b) => b.lotId)).toEqual(['dated-1', 'null-1']);
    expect(result.totalCost).toBe(10);
  });

  it('throws InsufficientInventoryError on global shortage', () => {
    const rows = [lot('L1', '2026-05-01', 4, 2, '2026-06-01')];
    expect(() => resolveFefo(rows, 5, CURRENCY, ASOF, ORG, PRODUCT)).toThrow(
      InsufficientInventoryError,
    );
  });

  it('does not mutate the caller input array (order preserved)', () => {
    const rows = [
      lot('A', '2026-05-01', 5, 2, '2026-06-15'),
      lot('B', '2026-05-03', 5, 3, '2026-06-01'),
    ];
    const idsBefore = rows.map((r) => r.id);
    resolveFefo(rows, 3, CURRENCY, ASOF, ORG, PRODUCT);
    expect(rows.map((r) => r.id)).toEqual(idsBefore);
  });

  it('produces identical output across N invocations (purity invariant)', () => {
    const rows = [
      lot('A', '2026-05-01', 5, 2, '2026-06-15'),
      lot('B', '2026-05-03', 5, 3, '2026-06-01'),
    ];
    const out1 = resolveFefo(rows, 6, CURRENCY, ASOF, ORG, PRODUCT);
    const out2 = resolveFefo(rows, 6, CURRENCY, ASOF, ORG, PRODUCT);
    expect(out1).toEqual(out2);
  });
});

describe('compareFefo', () => {
  it('orders earlier-expiry first', () => {
    const a = lot('A', '2026-05-01', 1, 1, '2026-06-15');
    const b = lot('B', '2026-05-01', 1, 1, '2026-06-01');
    expect(compareFefo(a, b)).toBeGreaterThan(0);
  });

  it('sorts NULL expires_at AFTER dated rows', () => {
    const a = lot('A', '2026-05-01', 1, 1, null);
    const b = lot('B', '2026-05-01', 1, 1, '2026-06-15');
    expect(compareFefo(a, b)).toBeGreaterThan(0);
    expect(compareFefo(b, a)).toBeLessThan(0);
  });

  it('NULL-vs-NULL falls through to receivedAt then id', () => {
    const a = lot('a', '2026-05-01', 1, 1, null);
    const b = lot('b', '2026-05-01', 1, 1, null);
    expect(compareFefo(a, b)).toBeLessThan(0);
  });
});
