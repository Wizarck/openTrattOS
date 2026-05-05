/**
 * Public types for the label renderer + print abstraction.
 *
 * Stable contract — every additive change should preserve consumers in
 * apps/api/ and packages/ui-kit/.
 */

export type LabelLocale = 'es' | 'en' | 'it';

export const SUPPORTED_LOCALES: readonly LabelLocale[] = ['es', 'en', 'it'] as const;

export type LabelPageSize = 'a4' | 'thermal-4x6' | 'thermal-50x80';

export const SUPPORTED_PAGE_SIZES: readonly LabelPageSize[] = [
  'a4',
  'thermal-4x6',
  'thermal-50x80',
] as const;

export interface LabelPostalAddress {
  street: string;
  city: string;
  postalCode: string;
  country: string;
}

export interface LabelContactInfo {
  email?: string;
  phone?: string;
}

/** Org-level mandatory + optional label fields populated by the resolver. */
export interface LabelOrg {
  businessName: string;
  contactInfo?: LabelContactInfo;
  postalAddress: LabelPostalAddress;
  brandMarkUrl?: string;
}

/**
 * Single ingredient row to display in the label, sorted by descending mass at
 * label render time per Article 18.
 */
export interface LabelIngredientRow {
  /** Ingredient display name in the requested locale, lower-cased. */
  name: string;
  /** Net mass contribution in grams (after yield × waste accumulation). */
  netMassG: number;
  /** Allergens carried by this ingredient (per Article 21 — emphasized in render). */
  allergens: string[];
}

export interface LabelMacros {
  /** kcal per 100 g of finished product. */
  kcalPer100g: number;
  /** g per 100 g of finished product. */
  fatPer100g: number;
  saturatedFatPer100g: number;
  carbohydratesPer100g: number;
  sugarsPer100g: number;
  proteinPer100g: number;
  saltPer100g: number;
}

/** Cross-contamination disclosure (Recipe-level, per #7). */
export interface LabelCrossContamination {
  note: string;
  allergens: string[];
}

export interface LabelRecipe {
  id: string;
  name: string;
  /** Number of portions the Recipe yields. */
  portions: number;
  /** Total finished mass in grams (sum of leaf scaled quantities × yield × waste). */
  totalNetMassG: number;
  /** Ingredients ordered by descending mass per Article 18. */
  ingredientList: LabelIngredientRow[];
  /** Recipe-level aggregated allergen list (per #7). */
  allergens: string[];
  crossContamination?: LabelCrossContamination;
  macros: LabelMacros;
}

/** Complete shape consumed by `LabelDocument` + `renderLabelToPdf`. */
export interface LabelData {
  recipe: LabelRecipe;
  org: LabelOrg;
  locale: LabelLocale;
  pageSize: LabelPageSize;
}
