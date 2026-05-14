// ============================================================
// FIFO resolver — pure function (m3-inventory-cost-resolver-fifo-fefo)
// ============================================================
//
// Per ADR-COST-RESOLVER-INTERFACE: orders lots by `receivedAt` ASC,
// ties broken by `id` lexicographic ASC for deterministic total
// ordering. Walks the queue via the shared `walkQueue` helper.
//
// Pure function — no I/O, no mutation of input array.

import {
  CostResolution,
  LotCostRow,
  Strategy,
} from '../domain/types';
import { walkQueue } from './walk-queue';

/**
 * Resolve cost via FIFO (first-in-first-out) — oldest received lot
 * consumed first. Returns the full `CostResolution` including the
 * post-consumption `remainingLots` for snapshot persistence by slice #5.
 *
 * @throws InsufficientInventoryError when the total available stock is
 *   strictly less than `qtyNeeded`.
 */
export function resolveFifo(
  rows: ReadonlyArray<LotCostRow>,
  qtyNeeded: number,
  currency: string,
  asOfTime: Date,
  organizationId: string,
  productId: string,
): CostResolution {
  // Spread to avoid mutating the caller's array; sort in place on the copy.
  const sorted = [...rows].sort(compareFifo);
  const { breakdown, remainingLots, totalCost } = walkQueue(
    sorted,
    qtyNeeded,
    organizationId,
    productId,
  );
  const strategy: Strategy = 'FIFO';
  return {
    totalCost,
    currency,
    strategy,
    breakdown,
    remainingLots,
    asOfTime,
  };
}

/**
 * Sort comparator: `receivedAt` ASC, tiebreak by `id` lexicographic ASC.
 * Exported for reuse by INT tests asserting query-plan order.
 */
export function compareFifo(a: LotCostRow, b: LotCostRow): number {
  const recvCmp = a.receivedAt.getTime() - b.receivedAt.getTime();
  if (recvCmp !== 0) return recvCmp;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
