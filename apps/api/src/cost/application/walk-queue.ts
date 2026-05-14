// ============================================================
// walkQueue — shared FIFO/FEFO consumption walker
// ============================================================
//
// Pure helper that walks an already-sorted lot queue, building the
// `CostBreakdownLine[]` + post-consumption `remainingLots[]` per
// ADR-COST-PARTIAL-LOT-CONSUMPTION (min(remaining, needed) per lot).
//
// Throws `InsufficientInventoryError` when the queue is exhausted
// before `qtyNeeded` is satisfied. The walker assumes the caller has
// already sorted `sortedLots` per strategy semantics; it does not
// re-sort.

import {
  CostBreakdownLine,
  LotCostRow,
} from '../domain/types';
import { InsufficientInventoryError } from '../domain/errors';
import { round4 } from './round';

export interface WalkResult {
  breakdown: CostBreakdownLine[];
  remainingLots: LotCostRow[];
  totalCost: number;
}

/**
 * Walk an already-sorted lot queue, consuming `qtyNeeded` units.
 *
 * Invariants:
 *   - Pure function; no I/O, no mutation of input rows
 *   - Returns ALL post-consumption lots (including untouched ones at
 *     the tail), so slice #5 can persist the full snapshot
 *   - `sum(breakdown.subtotal) === totalCost` within ROLLUP_TOLERANCE
 *
 * Throws when `sum(quantityRemaining across sortedLots) < qtyNeeded`.
 */
export function walkQueue(
  sortedLots: LotCostRow[],
  qtyNeeded: number,
  organizationId: string,
  productId: string,
): WalkResult {
  const breakdown: CostBreakdownLine[] = [];
  const remainingLots: LotCostRow[] = [];
  let needed = qtyNeeded;
  let total = 0;
  let consumedFromAvailable = 0;

  for (const lot of sortedLots) {
    if (needed <= 0) {
      // qty already satisfied — preserve remaining lots untouched
      remainingLots.push(lot);
      continue;
    }
    const take = Math.min(lot.quantityRemaining, needed);
    if (take > 0) {
      const subtotal = round4(take * lot.unitCostAtReceived);
      breakdown.push({
        lotId: lot.id,
        qty: take,
        unitCost: lot.unitCostAtReceived,
        subtotal,
        receivedAt: lot.receivedAt,
        expiresAt: lot.expiresAt,
      });
      total = round4(total + subtotal);
      needed = round4(needed - take);
      consumedFromAvailable += take;
    }
    const newRemaining = round4(lot.quantityRemaining - take);
    if (newRemaining > 0) {
      remainingLots.push({ ...lot, quantityRemaining: newRemaining });
    }
    // else: lot fully consumed, drop from remainingLots
  }

  if (needed > 0) {
    const available = round4(consumedFromAvailable);
    throw new InsufficientInventoryError(
      organizationId,
      productId,
      qtyNeeded,
      available,
    );
  }

  return { breakdown, remainingLots, totalCost: total };
}
