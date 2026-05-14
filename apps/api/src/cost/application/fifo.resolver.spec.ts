// ============================================================
// FIFO resolver — unit tests (boundary + algorithmic)
// ============================================================

import { resolveFifo, compareFifo } from './fifo.resolver';
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

describe('resolveFifo', () => {
  it('consumes a single lot exactly when qty matches', () => {
    const rows = [lot('L1', '2026-05-01', 10, 2.5)];
    const result = resolveFifo(rows, 10, CURRENCY, ASOF, ORG, PRODUCT);

    expect(result.strategy).toBe('FIFO');
    expect(result.totalCost).toBe(25);
    expect(result.breakdown).toHaveLength(1);
    expect(result.breakdown[0]).toMatchObject({ lotId: 'L1', qty: 10, subtotal: 25 });
    expect(result.remainingLots).toHaveLength(0);
    expect(result.currency).toBe(CURRENCY);
    expect(result.asOfTime).toEqual(ASOF);
  });

  it('takes partial qty from a single lot and preserves remainder', () => {
    const rows = [lot('L1', '2026-05-01', 10, 2.5)];
    const result = resolveFifo(rows, 4, CURRENCY, ASOF, ORG, PRODUCT);

    expect(result.totalCost).toBe(10);
    expect(result.breakdown[0].qty).toBe(4);
    expect(result.remainingLots).toHaveLength(1);
    expect(result.remainingLots[0].quantityRemaining).toBe(6);
  });

  it('walks multiple lots oldest-first when single lot insufficient', () => {
    const rows = [
      lot('L2', '2026-05-02', 10, 3),
      lot('L1', '2026-05-01', 3, 2.5),
    ];
    const result = resolveFifo(rows, 5, CURRENCY, ASOF, ORG, PRODUCT);

    expect(result.totalCost).toBe(13.5);
    expect(result.breakdown.map((b) => b.lotId)).toEqual(['L1', 'L2']);
    expect(result.breakdown[0]).toMatchObject({ qty: 3, subtotal: 7.5 });
    expect(result.breakdown[1]).toMatchObject({ qty: 2, subtotal: 6 });
    expect(result.remainingLots).toEqual([
      expect.objectContaining({ id: 'L2', quantityRemaining: 8 }),
    ]);
  });

  it('breaks tied receivedAt by id lexicographic ASC', () => {
    const rows = [
      lot('lot-bbb', '2026-05-01T10:00:00Z', 5, 2),
      lot('lot-aaa', '2026-05-01T10:00:00Z', 5, 3),
    ];
    const result = resolveFifo(rows, 5, CURRENCY, ASOF, ORG, PRODUCT);

    expect(result.breakdown[0].lotId).toBe('lot-aaa');
    expect(result.totalCost).toBe(15);
  });

  it('throws InsufficientInventoryError on empty queue', () => {
    expect(() => resolveFifo([], 5, CURRENCY, ASOF, ORG, PRODUCT)).toThrow(
      InsufficientInventoryError,
    );
  });

  it('throws InsufficientInventoryError on global shortage with quantity context', () => {
    const rows = [lot('L1', '2026-05-01', 3, 2)];
    try {
      resolveFifo(rows, 10, CURRENCY, ASOF, ORG, PRODUCT);
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(InsufficientInventoryError);
      const typed = err as InsufficientInventoryError;
      expect(typed.organizationId).toBe(ORG);
      expect(typed.productId).toBe(PRODUCT);
      expect(typed.quantityRequested).toBe(10);
      expect(typed.quantityAvailable).toBe(3);
      expect(typed.quantityShortfall).toBe(7);
      expect(typed.message).toContain('shortfall 7');
    }
  });

  it('skips zero-qty exhausted lot at front', () => {
    const rows = [
      lot('L1', '2026-05-01', 0, 2),
      lot('L2', '2026-05-02', 5, 3),
    ];
    const result = resolveFifo(rows, 5, CURRENCY, ASOF, ORG, PRODUCT);

    expect(result.breakdown).toHaveLength(1);
    expect(result.breakdown[0]).toMatchObject({ lotId: 'L2', qty: 5 });
    expect(result.remainingLots).toHaveLength(0);
  });

  it('stops at exact qty without touching the next lot', () => {
    const rows = [
      lot('L1', '2026-05-01', 3, 2),
      lot('L2', '2026-05-02', 2, 3),
      lot('L3', '2026-05-03', 10, 4),
    ];
    const result = resolveFifo(rows, 5, CURRENCY, ASOF, ORG, PRODUCT);

    expect(result.breakdown.map((b) => b.lotId)).toEqual(['L1', 'L2']);
    expect(result.remainingLots).toEqual([
      expect.objectContaining({ id: 'L3', quantityRemaining: 10 }),
    ]);
  });

  it('does not mutate the caller input array', () => {
    const rows = [
      lot('L2', '2026-05-02', 5, 3),
      lot('L1', '2026-05-01', 5, 2),
    ];
    const idsBefore = rows.map((r) => r.id);
    resolveFifo(rows, 4, CURRENCY, ASOF, ORG, PRODUCT);
    expect(rows.map((r) => r.id)).toEqual(idsBefore);
  });

  it('produces identical output across N invocations (purity invariant)', () => {
    const rows = [
      lot('L1', '2026-05-01', 5, 2),
      lot('L2', '2026-05-02', 5, 3),
    ];
    const out1 = resolveFifo(rows, 6, CURRENCY, ASOF, ORG, PRODUCT);
    const out2 = resolveFifo(rows, 6, CURRENCY, ASOF, ORG, PRODUCT);
    const out3 = resolveFifo(rows, 6, CURRENCY, ASOF, ORG, PRODUCT);
    expect(out1).toEqual(out2);
    expect(out2).toEqual(out3);
  });

  it('rounds subtotals to 4 decimal places', () => {
    const rows = [lot('L1', '2026-05-01', 3, 1.3333)];
    const result = resolveFifo(rows, 3, CURRENCY, ASOF, ORG, PRODUCT);
    expect(result.breakdown[0].subtotal).toBe(3.9999);
    expect(result.totalCost).toBe(3.9999);
  });
});

describe('compareFifo', () => {
  it('orders by receivedAt ASC', () => {
    const a = lot('Z', '2026-05-01', 1, 1);
    const b = lot('A', '2026-05-02', 1, 1);
    expect(compareFifo(a, b)).toBeLessThan(0);
  });

  it('ties broken by id lexicographic ASC', () => {
    const a = lot('z', '2026-05-01', 1, 1);
    const b = lot('a', '2026-05-01', 1, 1);
    expect(compareFifo(a, b)).toBeGreaterThan(0);
  });
});
