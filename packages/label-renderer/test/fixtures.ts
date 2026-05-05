import type { LabelData, LabelLocale, LabelPageSize } from '../src/types';

export function makeLabelData(overrides: Partial<LabelData> = {}): LabelData {
  const base: LabelData = {
    locale: 'es' as LabelLocale,
    pageSize: 'a4' as LabelPageSize,
    org: {
      businessName: 'Restaurante Tagliatelle',
      contactInfo: { email: 'info@example.com', phone: '+34 600 000 000' },
      postalAddress: {
        street: 'Calle Mayor 1',
        city: 'Madrid',
        postalCode: '28001',
        country: 'España',
      },
      brandMarkUrl: undefined,
    },
    recipe: {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Tagliatelle bolognesa',
      portions: 4,
      totalNetMassG: 1200,
      ingredientList: [
        { name: 'tagliatelle', netMassG: 400, allergens: ['gluten', 'eggs'] },
        { name: 'tomate triturado', netMassG: 350, allergens: [] },
        { name: 'carne picada', netMassG: 250, allergens: [] },
        { name: 'cebolla', netMassG: 100, allergens: [] },
        { name: 'aceite de oliva', netMassG: 100, allergens: [] },
      ],
      allergens: ['gluten', 'eggs'],
      crossContamination: { note: 'Producción compartida con frutos secos', allergens: ['nuts'] },
      macros: {
        kcalPer100g: 180,
        fatPer100g: 6.5,
        saturatedFatPer100g: 2.1,
        carbohydratesPer100g: 22.0,
        sugarsPer100g: 4.0,
        proteinPer100g: 8.5,
        saltPer100g: 0.8,
      },
    },
  };
  return { ...base, ...overrides };
}
