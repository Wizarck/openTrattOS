/**
 * Mirrors apps/api/src/cost/interface/dto/cost-delta.dto.ts (subset).
 * Each row attributes a delta to a single component (ingredient or sub-recipe).
 */

export type CostDeltaDirection = 'increase' | 'decrease' | 'unchanged';

export interface CostDeltaRow {
  /** Stable id of the ingredient or sub-recipe component. */
  componentId: string;
  /** Display name of the component (already formatted by the backend). */
  componentName: string;
  /** Cost at the start of the window. Null when the component is new. */
  oldCost: number | null;
  /** Cost at the end of the window. Null when the component was removed. */
  newCost: number | null;
  /** Absolute Euro delta (newCost - oldCost). Sign carries the direction. */
  deltaAbsolute: number;
  /**
   * Relative delta as a fraction (0.10 = +10%). Null when oldCost is null
   * (no baseline to divide against).
   */
  deltaPercent: number | null;
  direction: CostDeltaDirection;
  currency: string;
}

export interface CostDeltaTableProps {
  rows: CostDeltaRow[];
  loading?: boolean;
  emptyStateCopy?: string;
  /** Locale for currency + percent formatting. Defaults to en-EU. */
  locale?: string;
  /** Optional caption shown above the table for screen readers + visible text. */
  caption?: string;
  className?: string;
}
