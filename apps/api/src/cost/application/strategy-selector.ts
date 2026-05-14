// ============================================================
// Strategy selector — 2-level lookup (m3-inventory-cost-resolver-fifo-fefo)
// ============================================================
//
// Per ADR-COST-STRATEGY-PER-PRODUCT: org-policy override beats
// per-product default. NULL org override means "respect per-product".
//
//   selectStrategy(product, org) = org ?? product
//
// `'MANUAL'` is reserved for the org-policy override slot? NO — it is
// product-level only. The CHECK constraint on the org column rejects
// 'MANUAL'; this selector throws `StrategyMismatchError` as defence
// in depth.
//
// Pure function — no I/O.

import { Strategy } from '../domain/types';
import { isStrategy } from '../domain/strategy';
import {
  StrategyMismatchError,
  UnknownStrategyError,
} from '../domain/errors';

/**
 * Resolve the active strategy for a (product, organization) pair.
 *
 * @param productStrategy — value of `products.cost_resolution_strategy`
 * @param orgOverride — value of `organizations.cost_resolution_policy_override`
 *   (null means "no override"; FIFO|FEFO means "force this for the org"; MANUAL is invalid)
 * @param organizationId — for error messages
 * @throws UnknownStrategyError when either input is not a recognised strategy
 * @throws StrategyMismatchError when `orgOverride === 'MANUAL'`
 */
export function selectStrategy(
  productStrategy: Strategy,
  orgOverride: Strategy | null,
  organizationId: string,
): Strategy {
  if (!isStrategy(productStrategy)) {
    throw new UnknownStrategyError(String(productStrategy));
  }
  if (orgOverride !== null) {
    if (!isStrategy(orgOverride)) {
      throw new UnknownStrategyError(String(orgOverride));
    }
    if (orgOverride === 'MANUAL') {
      throw new StrategyMismatchError(organizationId, 'MANUAL');
    }
    return orgOverride;
  }
  return productStrategy;
}
