import {
  getAllergenName,
  isAllergenCode,
} from './allergen-vocabulary';
import { ALL_LOCALES } from './locales';

describe('allergen-vocabulary', () => {
  describe('isAllergenCode', () => {
    it('returns true for a canonical code', () => {
      expect(isAllergenCode('gluten')).toBe(true);
      expect(isAllergenCode('milk')).toBe(true);
      expect(isAllergenCode('molluscs')).toBe(true);
    });

    it('returns false for an unknown code', () => {
      expect(isAllergenCode('unicorn')).toBe(false);
    });

    it('returns false for non-string values', () => {
      expect(isAllergenCode(null)).toBe(false);
      expect(isAllergenCode(42)).toBe(false);
      expect(isAllergenCode({})).toBe(false);
    });
  });

  describe('getAllergenName', () => {
    it('returns the es-ES vocabulary entry for known codes', () => {
      expect(getAllergenName('gluten', 'es-ES')).toBe('Gluten');
      expect(getAllergenName('milk', 'es-ES')).toBe('Leche');
      expect(getAllergenName('eggs', 'es-ES')).toBe('Huevos');
    });

    it('returns the ca-ES vocabulary entry for known codes', () => {
      expect(getAllergenName('milk', 'ca-ES')).toBe('Llet');
      expect(getAllergenName('eggs', 'ca-ES')).toBe('Ous');
    });

    it('returns the eu-ES vocabulary entry for known codes', () => {
      expect(getAllergenName('milk', 'eu-ES')).toBe('Esnea');
      expect(getAllergenName('eggs', 'eu-ES')).toBe('Arrautzak');
    });

    it('returns the gl-ES vocabulary entry for known codes', () => {
      expect(getAllergenName('milk', 'gl-ES')).toBe('Leite');
      expect(getAllergenName('eggs', 'gl-ES')).toBe('Ovos');
    });

    it('returns wrapped-code sentinel for an unknown code', () => {
      expect(getAllergenName('unicorn', 'es-ES')).toBe('«unicorn»');
      expect(getAllergenName('unicorn', 'eu-ES')).toBe('«unicorn»');
    });

    it('returns a non-empty distinct entry for every canonical code × locale', () => {
      const codes = [
        'gluten',
        'crustaceans',
        'eggs',
        'fish',
        'peanuts',
        'soybeans',
        'milk',
        'tree-nuts',
        'celery',
        'mustard',
        'sesame',
        'sulphites',
        'lupin',
        'molluscs',
      ] as const;
      for (const code of codes) {
        for (const locale of ALL_LOCALES) {
          const name = getAllergenName(code, locale);
          expect(name).not.toBe('');
          expect(name.startsWith('«')).toBe(false);
        }
      }
    });
  });
});
