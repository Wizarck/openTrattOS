import type { LabelLocale } from '../types';

/**
 * i18n bundle for label-rendering strings. Three locales supported in M2:
 * `es`, `en`, `it` (Gate D fork 5a). Bilingual layouts are out of scope.
 *
 * Allergen labels follow EU 1169/2011 Annex II canonical naming. Lower-case
 * with hyphenless variants where possible (matches RecipesAllergensService).
 */

export interface LabelStrings {
  /** Section header: "Ingredientes" / "Ingredients" / "Ingredienti" */
  ingredients: string;
  /** Allergen panel header: "Alérgenos" / "Allergens" / "Allergeni" */
  allergens: string;
  /** Cross-contamination preface: "Puede contener trazas de" */
  crossContaminationPreface: string;
  /** Macro panel header: "Información nutricional (por 100g)" */
  nutritionPer100g: string;
  /** "kcal" */
  kcal: string;
  /** "Grasas" / "Fat" / "Grassi" */
  fat: string;
  /** "de las cuales saturadas" / "of which saturates" / "di cui saturi" */
  saturatedFat: string;
  /** "Hidratos de carbono" / "Carbohydrate" / "Carboidrati" */
  carbohydrates: string;
  /** "de los cuales azúcares" / "of which sugars" / "di cui zuccheri" */
  sugars: string;
  /** "Proteínas" / "Protein" / "Proteine" */
  protein: string;
  /** "Sal" / "Salt" / "Sale" */
  salt: string;
  /** "Cantidad neta" / "Net quantity" / "Quantità netta" */
  netQuantity: string;
  /** "por porción" / "per portion" / "per porzione" */
  perPortion: string;
  /** "porciones" / "portions" / "porzioni" */
  portions: string;
  /** Per-allergen display labels, keyed by Annex II canonical name. */
  allergenLabels: Record<string, string>;
}

const ALLERGEN_LABELS_ES: Record<string, string> = {
  gluten: 'gluten',
  crustaceans: 'crustáceos',
  eggs: 'huevos',
  fish: 'pescado',
  peanuts: 'cacahuetes',
  soybeans: 'soja',
  milk: 'leche',
  nuts: 'frutos de cáscara',
  celery: 'apio',
  mustard: 'mostaza',
  sesame: 'sésamo',
  sulphites: 'sulfitos',
  lupin: 'altramuces',
  molluscs: 'moluscos',
};

const ALLERGEN_LABELS_EN: Record<string, string> = {
  gluten: 'gluten',
  crustaceans: 'crustaceans',
  eggs: 'eggs',
  fish: 'fish',
  peanuts: 'peanuts',
  soybeans: 'soybeans',
  milk: 'milk',
  nuts: 'nuts',
  celery: 'celery',
  mustard: 'mustard',
  sesame: 'sesame',
  sulphites: 'sulphites',
  lupin: 'lupin',
  molluscs: 'molluscs',
};

const ALLERGEN_LABELS_IT: Record<string, string> = {
  gluten: 'glutine',
  crustaceans: 'crostacei',
  eggs: 'uova',
  fish: 'pesce',
  peanuts: 'arachidi',
  soybeans: 'soia',
  milk: 'latte',
  nuts: 'frutta a guscio',
  celery: 'sedano',
  mustard: 'senape',
  sesame: 'sesamo',
  sulphites: 'solfiti',
  lupin: 'lupino',
  molluscs: 'molluschi',
};

export const LOCALE_STRINGS: Record<LabelLocale, LabelStrings> = {
  es: {
    ingredients: 'Ingredientes',
    allergens: 'Alérgenos',
    crossContaminationPreface: 'Puede contener trazas de',
    nutritionPer100g: 'Información nutricional (por 100g)',
    kcal: 'kcal',
    fat: 'Grasas',
    saturatedFat: 'de las cuales saturadas',
    carbohydrates: 'Hidratos de carbono',
    sugars: 'de los cuales azúcares',
    protein: 'Proteínas',
    salt: 'Sal',
    netQuantity: 'Cantidad neta',
    perPortion: 'por porción',
    portions: 'porciones',
    allergenLabels: ALLERGEN_LABELS_ES,
  },
  en: {
    ingredients: 'Ingredients',
    allergens: 'Allergens',
    crossContaminationPreface: 'May contain traces of',
    nutritionPer100g: 'Nutrition information (per 100g)',
    kcal: 'kcal',
    fat: 'Fat',
    saturatedFat: 'of which saturates',
    carbohydrates: 'Carbohydrate',
    sugars: 'of which sugars',
    protein: 'Protein',
    salt: 'Salt',
    netQuantity: 'Net quantity',
    perPortion: 'per portion',
    portions: 'portions',
    allergenLabels: ALLERGEN_LABELS_EN,
  },
  it: {
    ingredients: 'Ingredienti',
    allergens: 'Allergeni',
    crossContaminationPreface: 'Può contenere tracce di',
    nutritionPer100g: 'Valori nutrizionali (per 100g)',
    kcal: 'kcal',
    fat: 'Grassi',
    saturatedFat: 'di cui saturi',
    carbohydrates: 'Carboidrati',
    sugars: 'di cui zuccheri',
    protein: 'Proteine',
    salt: 'Sale',
    netQuantity: 'Quantità netta',
    perPortion: 'per porzione',
    portions: 'porzioni',
    allergenLabels: ALLERGEN_LABELS_IT,
  },
};

/** Look up a per-allergen display label for the given locale. Falls back to the canonical name. */
export function localizeAllergen(allergen: string, locale: LabelLocale): string {
  return LOCALE_STRINGS[locale].allergenLabels[allergen] ?? allergen;
}
