/**
 * Mirrors apps/api/src/ingredients/interface/dto/ingredient.dto.ts MacroRollupDto.
 * Hand-mirrored per #12 + #13 retro tech-debt note (codegen pipeline filed).
 */

export interface MacroRollup {
  /** Per-portion macro totals (kcal + protein/fat/carbs etc). Keys are OFF nutrition keys. */
  perPortion: Record<string, number>;
  /** Per-100g macros. Empty when total weight cannot be tracked (mixed-base recipes). */
  per100g: Record<string, number>;
  /** Total recipe weight in grams when computable; null otherwise. */
  totalWeightG: number | null;
  /** OFF-sourced ingredient/source pairs for ODbL attribution. */
  externalSources: Array<{ ingredientId: string; externalSourceRef: string }>;
}

export interface MacroPanelProps {
  /** When `null`, the panel renders the loading skeleton. */
  rollup: MacroRollup | null;
  /** Forces the loading skeleton even when rollup is non-null. */
  loading?: boolean;
  /** Compact (per-portion only) vs expanded (both per-portion + per-100g). Defaults to compact. */
  mode?: 'compact' | 'expanded';
  /** Locale for number formatting. Defaults to en-EU. */
  locale?: string;
  /** Override the empty-state copy when no nutrition data is available. */
  emptyStateCopy?: string;
  className?: string;
}

/**
 * Common OFF nutrition keys we render. Order in the rendered table follows
 * this list. Unknown keys are appended after these in insertion order.
 */
export const PRIMARY_MACRO_KEYS: readonly string[] = [
  'energy-kcal',
  'proteins',
  'carbohydrates',
  'sugars',
  'fat',
  'saturated-fat',
  'fiber',
  'salt',
] as const;

/** Human-readable labels for the primary keys. Locale-agnostic (EN). */
export const MACRO_LABELS: Record<string, string> = {
  'energy-kcal': 'Energy (kcal)',
  proteins: 'Protein (g)',
  carbohydrates: 'Carbs (g)',
  sugars: 'Sugars (g)',
  fat: 'Fat (g)',
  'saturated-fat': 'Saturated fat (g)',
  fiber: 'Fibre (g)',
  salt: 'Salt (g)',
};
