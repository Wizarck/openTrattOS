/**
 * Mirrors apps/api/src/recipes/interface/dto/diet-flags.dto.ts (subset).
 * The override metadata is captured per #7 m2-allergens-article-21:
 * Manager+ writes `value` + `reason` + audit fields; backend echoes them on
 * read.
 */

export type DietFlag =
  | 'vegan'
  | 'vegetarian'
  | 'gluten-free'
  | 'halal'
  | 'kosher'
  | 'keto';

export const ALL_DIET_FLAGS: readonly DietFlag[] = [
  'vegan',
  'vegetarian',
  'gluten-free',
  'halal',
  'kosher',
  'keto',
] as const;

export interface DietFlagsOverride {
  value: DietFlag[];
  reason: string;
  appliedBy: string;
  appliedAt: string;
}

export interface DietFlagsState {
  /** Inferred flags from leaf ingredients (conservative, never auto-cleared). */
  asserted: DietFlag[];
  /** Manager+ override (replaces `asserted` for downstream consumers). */
  override?: DietFlagsOverride;
  /** Free-text warnings emitted by the inference engine. */
  warnings?: string[];
}

export interface DietFlagsPanelProps {
  state: DietFlagsState;
  /** When false (Staff role), the Override button is hidden. */
  canOverride: boolean;
  /**
   * Called when the user submits a valid override from the modal. Should
   * persist to the backend; the panel applies an optimistic visible update
   * but consumes the returned promise to roll back on rejection.
   */
  onApplyOverride: (payload: { value: DietFlag[]; reason: string }) => Promise<void>;
  /** Minimum reason length. Defaults to 10 (per Gate D decision 2). */
  minReasonLength?: number;
  className?: string;
}
