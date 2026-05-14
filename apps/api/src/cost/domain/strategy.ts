// ============================================================
// Strategy enum + type-guard (m3-inventory-cost-resolver-fifo-fefo)
// ============================================================
//
// Thin shim over `Strategy` re-exported as a const-object enum for
// runtime callers, with a type-guard for defensive validation after
// DB reads. Per ADR-COST-STRATEGY-PER-PRODUCT, the DB column carries
// a CHECK constraint — this guard is defence-in-depth for schema drift.

import { Strategy } from './types';

export const STRATEGY = {
  FIFO: 'FIFO',
  FEFO: 'FEFO',
  MANUAL: 'MANUAL',
} as const satisfies Record<Strategy, Strategy>;

const STRATEGY_VALUES: ReadonlyArray<Strategy> = ['FIFO', 'FEFO', 'MANUAL'];

export function isStrategy(value: unknown): value is Strategy {
  return (
    typeof value === 'string' &&
    (STRATEGY_VALUES as readonly string[]).includes(value)
  );
}

const ORG_POLICY_VALUES: ReadonlyArray<'FIFO' | 'FEFO'> = ['FIFO', 'FEFO'];

export function isOrgPolicyStrategy(value: unknown): value is 'FIFO' | 'FEFO' {
  return (
    typeof value === 'string' &&
    (ORG_POLICY_VALUES as readonly string[]).includes(value)
  );
}
