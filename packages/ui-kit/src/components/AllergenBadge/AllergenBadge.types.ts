/**
 * EU 1169/2011 Annex II — the 14 declarable allergens. Code is the
 * canonical machine identifier; the display label is i18n'd on the
 * consumer side via `aria-label` / inner-text override.
 */
export type AllergenCode =
  | 'gluten'
  | 'crustaceans'
  | 'eggs'
  | 'fish'
  | 'peanuts'
  | 'soybeans'
  | 'milk'
  | 'tree-nuts'
  | 'celery'
  | 'mustard'
  | 'sesame'
  | 'sulphites'
  | 'lupin'
  | 'molluscs';

export interface AllergenBadgeProps {
  /** Canonical allergen code (or any free-string for cross-contamination notes). */
  allergen: string;
  /**
   * When true, applies Article-21 emphasis: bolder weight + stronger
   * background contrast (≥5:1 against the surface). Per ADR-017 +
   * EU 1169/2011 Article 21.
   */
  emphasised?: boolean;
  /**
   * Optional override for the visible label (i18n hook). Defaults to the
   * `allergen` code formatted in title case.
   */
  label?: string;
  /**
   * Variant for cross-contamination disclosure ("may contain X"). Renders
   * with a dashed border and a "may contain" prefix per design.md §"Cross-
   * contamination variant".
   */
  crossContamination?: boolean;
  className?: string;
  'aria-label'?: string;
}
