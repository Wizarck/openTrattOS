import {
  ExternalFoodCatalog,
  ExternalFoodCatalogCreateProps,
} from './external-food-catalog.entity';

const validProps = (
  overrides: Partial<ExternalFoodCatalogCreateProps> = {},
): ExternalFoodCatalogCreateProps => ({
  barcode: '8410173005111',
  name: 'Aceite de oliva virgen extra',
  brand: 'Carbonell',
  nutrition: { 'energy-kcal_100g': 884 },
  allergens: [],
  dietFlags: ['vegan', 'gluten-free'],
  region: 'ES',
  lastModifiedAt: new Date('2025-12-01T00:00:00Z'),
  licenseAttribution: 'Source: Open Food Facts (ODbL v1.0)',
  ...overrides,
});

describe('ExternalFoodCatalog.create', () => {
  it('returns a row with UUID id, props applied, syncedAt set', () => {
    const row = ExternalFoodCatalog.create(validProps());
    expect(row.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(row.barcode).toBe('8410173005111');
    expect(row.name).toBe('Aceite de oliva virgen extra');
    expect(row.brand).toBe('Carbonell');
    expect(row.region).toBe('ES');
    expect(row.allergens).toEqual([]);
    expect(row.dietFlags).toEqual(['vegan', 'gluten-free']);
    expect(row.licenseAttribution).toMatch(/Open Food Facts/);
    expect(row.syncedAt).toBeInstanceOf(Date);
  });

  it('trims barcode/name/region/license whitespace', () => {
    const row = ExternalFoodCatalog.create(
      validProps({ barcode: '  123  ', name: '  Tomate  ', region: ' ES ', licenseAttribution: '  ODbL ' }),
    );
    expect(row.barcode).toBe('123');
    expect(row.name).toBe('Tomate');
    expect(row.region).toBe('ES');
    expect(row.licenseAttribution).toBe('ODbL');
  });

  it('normalises blank brand to null', () => {
    expect(ExternalFoodCatalog.create(validProps({ brand: '   ' })).brand).toBeNull();
    expect(ExternalFoodCatalog.create(validProps({ brand: null })).brand).toBeNull();
  });

  it('rejects empty barcode/name/region/license', () => {
    expect(() => ExternalFoodCatalog.create(validProps({ barcode: '' }))).toThrow(/barcode/i);
    expect(() => ExternalFoodCatalog.create(validProps({ name: '   ' }))).toThrow(/name/i);
    expect(() => ExternalFoodCatalog.create(validProps({ region: '' }))).toThrow(/region/i);
    expect(() => ExternalFoodCatalog.create(validProps({ licenseAttribution: '' }))).toThrow(
      /licenseAttribution|ODbL/i,
    );
  });

  it('clones array inputs (no shared references)', () => {
    const allergens = ['gluten'];
    const dietFlags = ['vegan'];
    const row = ExternalFoodCatalog.create(validProps({ allergens, dietFlags }));
    allergens.push('milk');
    dietFlags.push('halal');
    expect(row.allergens).toEqual(['gluten']);
    expect(row.dietFlags).toEqual(['vegan']);
  });
});

describe('ExternalFoodCatalog.applyUpdate', () => {
  it('updates mutable fields and refreshes syncedAt', async () => {
    const row = ExternalFoodCatalog.create(validProps());
    const before = row.syncedAt.getTime();
    await new Promise((r) => setTimeout(r, 5));
    row.applyUpdate({
      name: 'Aceite oliva extra',
      brand: 'La Española',
      nutrition: { fat_100g: 100 },
      allergens: ['nuts'],
      dietFlags: ['vegan'],
      lastModifiedAt: new Date('2026-01-01'),
      licenseAttribution: 'Source: Open Food Facts (ODbL v1.0) - 2026',
    });
    expect(row.name).toBe('Aceite oliva extra');
    expect(row.brand).toBe('La Española');
    expect(row.nutrition).toEqual({ fat_100g: 100 });
    expect(row.allergens).toEqual(['nuts']);
    expect(row.dietFlags).toEqual(['vegan']);
    expect(row.licenseAttribution).toMatch(/2026/);
    expect(row.syncedAt.getTime()).toBeGreaterThan(before);
  });

  it('rejects barcode and region mutations (composite identity)', () => {
    const row = ExternalFoodCatalog.create(validProps());
    expect(() =>
      row.applyUpdate({ barcode: '999' } as Parameters<typeof row.applyUpdate>[0]),
    ).toThrow(/barcode|immutable/i);
    expect(() =>
      row.applyUpdate({ region: 'IT' } as Parameters<typeof row.applyUpdate>[0]),
    ).toThrow(/region|immutable/i);
  });

  it('rejects blank name and license replacements', () => {
    const row = ExternalFoodCatalog.create(validProps());
    expect(() => row.applyUpdate({ name: '   ' })).toThrow(/name/i);
    expect(() => row.applyUpdate({ licenseAttribution: '' })).toThrow(/license/i);
  });

  it('accepts null nutrition (OFF rows without nutriments)', () => {
    const row = ExternalFoodCatalog.create(validProps({ nutrition: { x: 1 } }));
    row.applyUpdate({ nutrition: null });
    expect(row.nutrition).toBeNull();
  });
});
