// ============================================================
// FEFO resolver — pure function (m3-inventory-cost-resolver-fifo-fefo)
// ============================================================
//
// Per ADR-COST-FEFO-NULLS: orders lots by `expiresAt` ASC with
// `expiresAt IS NULL` rows pushed LAST. Within each group, secondary
// sort is `receivedAt` ASC; tertiary sort is `id` lexicographic ASC
// for deterministic total ordering.
//
// Rationale: shelf-stable items (oil, salt) carry no expiry urgency,
// so they should consume LAST so dated lots near expiry consume first.
// HACCP physical flow expects this ordering.
//
// Pure function — no I/O, no mutation of input array.

import {
  CostResolution,
  LotCostRow,
  Strategy,
} from '../domain/types';
import { walkQueue } from './walk-queue';

/**
 * Resolve cost via FEFO (first-expired-first-out) — nearest-expiry
 * lot consumed first; NULL-expiry lots sort LAST.
 *
 * @throws InsufficientInventoryError when the total available stock is
 *   strictly less than `qtyNeeded`.
 */
export function resolveFefo(
  rows: ReadonlyArray<LotCostRow>,
  qtyNeeded: number,
  currency: string,
  asOfTime: Date,
  organizationId: string,
  productId: string,
): CostResolution {
  const sorted = [...rows].sort(compareFefo);
  const { breakdown, remainingLots, totalCost } = walkQueue(
    sorted,
    qtyNeeded,
    organizationId,
    productId,
  );
  const strategy: Strategy = 'FEFO';
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
 * Sort comparator: `expiresAt` ASC NULLS LAST, tiebreak by
 * `receivedAt` ASC, then `id` lexicographic ASC.
 * Exported for INT-test parity checks against the DB ORDER BY.
 */
export function compareFefo(a: LotCostRow, b: LotCostRow): number {
  const aNull = a.expiresAt === null;
  const bNull = b.expiresAt === null;
  if (aNull && bNull) return tiebreakReceivedThenId(a, b);
  if (aNull) return 1; // a (null) goes after b (non-null)
  if (bNull) return -1; // a (non-null) goes before b (null)
  // both non-null: compare expiry
  // SAFETY: `aNull`/`bNull` checks above guarantee both are Date instances here.
  const expCmp =
    (a.expiresAt as Date).getTime() - (b.expiresAt as Date).getTime();
  if (expCmp !== 0) return expCmp;
  return tiebreakReceivedThenId(a, b);
}

function tiebreakReceivedThenId(a: LotCostRow, b: LotCostRow): number {
  const recvCmp = a.receivedAt.getTime() - b.receivedAt.getTime();
  if (recvCmp !== 0) return recvCmp;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
