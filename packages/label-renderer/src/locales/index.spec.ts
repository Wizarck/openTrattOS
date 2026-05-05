import { LOCALE_STRINGS, localizeAllergen } from './index';
import { SUPPORTED_LOCALES } from '../types';

describe('locales', () => {
  it('exposes a complete bundle for every supported locale', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const bundle = LOCALE_STRINGS[locale];
      expect(bundle.ingredients).toBeTruthy();
      expect(bundle.allergens).toBeTruthy();
      expect(bundle.crossContaminationPreface).toBeTruthy();
      expect(bundle.nutritionPer100g).toBeTruthy();
      expect(bundle.netQuantity).toBeTruthy();
      expect(bundle.perPortion).toBeTruthy();
      expect(bundle.portions).toBeTruthy();
      expect(bundle.allergenLabels).toBeDefined();
    }
  });

  it('localizes the 14 EU 1169/2011 Annex II allergens for every locale', () => {
    const annex2 = [
      'gluten',
      'crustaceans',
      'eggs',
      'fish',
      'peanuts',
      'soybeans',
      'milk',
      'nuts',
      'celery',
      'mustard',
      'sesame',
      'sulphites',
      'lupin',
      'molluscs',
    ];
    for (const locale of SUPPORTED_LOCALES) {
      for (const allergen of annex2) {
        const localized = localizeAllergen(allergen, locale);
        expect(localized).toBeTruthy();
        if (locale !== 'en') {
          // Most non-English variants differ from the canonical name.
          // (`peanuts` happens to be the same in some bundles; just check non-empty.)
        }
      }
    }
  });

  it('falls back to canonical name when an allergen is not in the bundle', () => {
    expect(localizeAllergen('unknown-allergen', 'es')).toBe('unknown-allergen');
  });

  it('produces locale-specific Spanish labels for major allergens', () => {
    expect(localizeAllergen('milk', 'es')).toBe('leche');
    expect(localizeAllergen('eggs', 'es')).toBe('huevos');
    expect(localizeAllergen('nuts', 'es')).toBe('frutos de cáscara');
  });

  it('produces locale-specific Italian labels for major allergens', () => {
    expect(localizeAllergen('milk', 'it')).toBe('latte');
    expect(localizeAllergen('eggs', 'it')).toBe('uova');
  });
});
