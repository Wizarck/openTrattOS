import { Ingredient, IngredientCreateProps, BaseUnitType } from './ingredient.entity';

const orgId = '11111111-1111-4111-8111-111111111111';
const categoryId = '22222222-2222-4222-8222-222222222222';
const validProps = (overrides: Partial<IngredientCreateProps> = {}): IngredientCreateProps => ({
  organizationId: orgId,
  categoryId,
  name: 'Tomate Pera',
  baseUnitType: 'WEIGHT',
  ...overrides,
});

describe('Ingredient.create', () => {
  it('returns an Ingredient with UUID id, defaults isActive=true, autogen internalCode', () => {
    const ing = Ingredient.create(validProps());
    expect(ing.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(ing.organizationId).toBe(orgId);
    expect(ing.categoryId).toBe(categoryId);
    expect(ing.name).toBe('Tomate Pera');
    expect(ing.baseUnitType).toBe('WEIGHT');
    expect(ing.isActive).toBe(true);
    expect(ing.internalCode).toMatch(/^[a-z0-9-]+$/i);
    expect(ing.internalCode.length).toBeGreaterThan(0);
  });

  it('uses provided internalCode when given', () => {
    const ing = Ingredient.create(validProps({ internalCode: 'TOM-001' }));
    expect(ing.internalCode).toBe('TOM-001');
  });

  it('rejects empty name', () => {
    expect(() => Ingredient.create(validProps({ name: '' }))).toThrow(/name/i);
  });

  describe('baseUnitType enum', () => {
    it.each<BaseUnitType>(['WEIGHT', 'VOLUME', 'UNIT'])('accepts %s', (type) => {
      expect(() => Ingredient.create(validProps({ baseUnitType: type }))).not.toThrow();
    });

    it.each(['weight', 'COUNT', '', 'EACH'])('rejects "%s"', (type) => {
      expect(() => Ingredient.create(validProps({ baseUnitType: type as BaseUnitType }))).toThrow(/baseUnitType/i);
    });
  });

  describe('densityFactor invariants', () => {
    it('UNIT family forbids densityFactor (non-null rejected)', () => {
      expect(() =>
        Ingredient.create(validProps({ baseUnitType: 'UNIT', densityFactor: 0.92 })),
      ).toThrow(/UNIT|density/i);
    });

    it.each<BaseUnitType>(['WEIGHT', 'VOLUME'])('%s allows null densityFactor', (type) => {
      expect(() => Ingredient.create(validProps({ baseUnitType: type }))).not.toThrow();
    });

    it.each<BaseUnitType>(['WEIGHT', 'VOLUME'])('%s allows positive densityFactor', (type) => {
      const ing = Ingredient.create(validProps({ baseUnitType: type, densityFactor: 0.92 }));
      expect(ing.densityFactor).toBe(0.92);
    });

    it.each([0, -0.5, NaN, Infinity])('rejects non-positive/non-finite densityFactor: %s', (df) => {
      expect(() => Ingredient.create(validProps({ densityFactor: df as number }))).toThrow(/density/i);
    });
  });

  it('rejects non-uuid organizationId or categoryId', () => {
    expect(() => Ingredient.create(validProps({ organizationId: 'nope' }))).toThrow(/organizationId|uuid/i);
    expect(() => Ingredient.create(validProps({ categoryId: 'nope' }))).toThrow(/categoryId|uuid/i);
  });
});

describe('Ingredient.applyUpdate', () => {
  it('updates mutable fields (name, internalCode, categoryId, notes, densityFactor)', () => {
    const ing = Ingredient.create(validProps());
    ing.applyUpdate({
      name: 'Tomate Cherry',
      internalCode: 'TOM-002',
      categoryId: '33333333-3333-4333-8333-333333333333',
      notes: 'season: summer',
      densityFactor: 1.0,
    });
    expect(ing.name).toBe('Tomate Cherry');
    expect(ing.internalCode).toBe('TOM-002');
    expect(ing.categoryId).toBe('33333333-3333-4333-8333-333333333333');
    expect(ing.notes).toBe('season: summer');
    expect(ing.densityFactor).toBe(1.0);
  });

  it('refuses to change baseUnitType (immutable)', () => {
    const ing = Ingredient.create(validProps({ baseUnitType: 'WEIGHT' }));
    expect(() =>
      ing.applyUpdate({ baseUnitType: 'VOLUME' } as Parameters<typeof ing.applyUpdate>[0]),
    ).toThrow(/baseUnitType|immutable/i);
  });

  it('refuses to change organizationId', () => {
    const ing = Ingredient.create(validProps());
    expect(() =>
      ing.applyUpdate({
        organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      } as Parameters<typeof ing.applyUpdate>[0]),
    ).toThrow(/organizationId|tenant/i);
  });

  it('rejects density update for UNIT family', () => {
    const ing = Ingredient.create(validProps({ baseUnitType: 'UNIT' }));
    expect(() => ing.applyUpdate({ densityFactor: 1 })).toThrow(/UNIT|density/i);
  });
});

describe('Ingredient soft-delete', () => {
  it('deactivate() sets isActive=false', () => {
    const ing = Ingredient.create(validProps());
    expect(ing.isActive).toBe(true);
    ing.deactivate();
    expect(ing.isActive).toBe(false);
  });

  it('reactivate() sets isActive=true', () => {
    const ing = Ingredient.create(validProps());
    ing.deactivate();
    ing.reactivate();
    expect(ing.isActive).toBe(true);
  });
});
