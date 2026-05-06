/**
 * Reason a cost rebuild happened. Persisted on each `RECIPE_COST_REBUILT`
 * audit_log row's `payload_after.reason`. Previously lived on the
 * `recipe_cost_history` entity (see migration 0011); extracted here as a
 * standalone type so the audit_log path doesn't depend on the legacy entity
 * (which is removed in this slice).
 */
export type CostChangeReason =
  | 'INITIAL'
  | 'SUPPLIER_PRICE_CHANGE'
  | 'LINE_EDIT'
  | 'SUB_RECIPE_CHANGE'
  | 'SOURCE_OVERRIDE'
  | 'MANUAL_RECOMPUTE';

export const COST_CHANGE_REASONS: CostChangeReason[] = [
  'INITIAL',
  'SUPPLIER_PRICE_CHANGE',
  'LINE_EDIT',
  'SUB_RECIPE_CHANGE',
  'SOURCE_OVERRIDE',
  'MANUAL_RECOMPUTE',
];

export function isCostChangeReason(value: unknown): value is CostChangeReason {
  return typeof value === 'string' && COST_CHANGE_REASONS.includes(value as CostChangeReason);
}
