import { Ingredient } from '../../ingredients/domain/ingredient.entity';
import { SupplierItem, SupplierItemCreateProps } from './supplier-item.entity';

const orgId = '11111111-1111-4111-8111-111111111111';
const supplierId = '22222222-2222-4222-8222-222222222222';
const ingredientId = '33333333-3333-4333-8333-333333333333';
const categoryId = '44444444-4444-4444-8444-444444444444';

const validProps = (overrides: Partial<SupplierItemCreateProps> = {}): SupplierItemCreateProps => ({
  supplierId,
  ingredientId,
  purchaseUnit: '5 kg Box',
  purchaseUnitQty: 5,
  purchaseUnitType: 'kg',
  unitPrice: 25,
  isPreferred: false,
  ...overrides,
});

const weightIngredient = (): Ingredient =>
  Ingredient.create({
    organizationId: orgId,
    categoryId,
    name: 'Tomate',
    baseUnitType: 'WEIGHT',
  });

const volumeIngredient = (): Ingredient =>
  Ingredient.create({
    organizationId: orgId,
    categoryId,
    name: 'Aceite oliva',
    baseUnitType: 'VOLUME',
  });

const unitIngredient = (): Ingredient =>
  Ingredient.create({
    organizationId: orgId,
    categoryId,
    name: 'Huevo',
    baseUnitType: 'UNIT',
  });

describe('SupplierItem.create', () => {
  it('returns a SupplierItem with UUID id and props', () => {
    const si = SupplierItem.create(validProps());
    expect(si.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(si.supplierId).toBe(supplierId);
    expect(si.ingredientId).toBe(ingredientId);
    expect(si.purchaseUnit).toBe('5 kg Box');
    expect(si.purchaseUnitQty).toBe(5);
    expect(si.purchaseUnitType).toBe('kg');
    expect(si.unitPrice).toBe(25);
    expect(si.isPreferred).toBe(false);
  });

  it.each([0, -1, NaN, Infinity])('rejects unitPrice %s', (p) => {
    expect(() => SupplierItem.create(validProps({ unitPrice: p as number }))).toThrow(/unitPrice/i);
  });

  it.each([0, -1, NaN, Infinity])('rejects purchaseUnitQty %s', (q) => {
    expect(() => SupplierItem.create(validProps({ purchaseUnitQty: q as number }))).toThrow(/purchaseUnitQty/i);
  });

  it('rejects empty purchaseUnit label', () => {
    expect(() => SupplierItem.create(validProps({ purchaseUnit: '' }))).toThrow(/purchaseUnit/i);
  });

  it('rejects unknown purchaseUnitType code', () => {
    expect(() => SupplierItem.create(validProps({ purchaseUnitType: 'xx' }))).toThrow(/purchaseUnitType|UoM/i);
  });
});

describe('SupplierItem.computeCostPerBaseUnit (D6 4-decimal precision)', () => {
  function pair(
    overrides: Partial<SupplierItemCreateProps> = {},
    family: 'WEIGHT' | 'VOLUME' | 'UNIT' = 'WEIGHT',
  ): { ingredient: Ingredient; si: SupplierItem } {
    const ingredient =
      family === 'WEIGHT' ? weightIngredient() : family === 'VOLUME' ? volumeIngredient() : unitIngredient();
    const si = SupplierItem.create({ ...validProps(overrides), ingredientId: ingredient.id });
    return { ingredient, si };
  }

  it('25€ for "5 kg Box" of WEIGHT ingredient → 0.005 €/g (rounded to 4 dp)', () => {
    const { ingredient, si } = pair();
    expect(si.computeCostPerBaseUnit(ingredient)).toBeCloseTo(0.005, 4);
  });

  it('rounds to 4 decimal places (17€ / 3 kg = 5.6667 €/kg = 0.0057 €/g)', () => {
    const { ingredient, si } = pair({ unitPrice: 17, purchaseUnitQty: 3, purchaseUnitType: 'kg' });
    expect(si.computeCostPerBaseUnit(ingredient)).toBe(0.0057);
  });

  it('1€/L for VOLUME ingredient → 0.001 €/ml', () => {
    const { ingredient, si } = pair(
      { purchaseUnit: '1 L', purchaseUnitQty: 1, purchaseUnitType: 'L', unitPrice: 1 },
      'VOLUME',
    );
    expect(si.computeCostPerBaseUnit(ingredient)).toBeCloseTo(0.001, 4);
  });

  it('12€ for "1 dozen" of UNIT ingredient → 1 €/pcs', () => {
    const { ingredient, si } = pair(
      { purchaseUnit: '1 dozen', purchaseUnitQty: 1, purchaseUnitType: 'dozen', unitPrice: 12 },
      'UNIT',
    );
    expect(si.computeCostPerBaseUnit(ingredient)).toBeCloseTo(1, 4);
  });

  it('rejects family mismatch (kg purchase for VOLUME ingredient)', () => {
    const { ingredient, si } = pair({ purchaseUnitType: 'kg' }, 'VOLUME');
    expect(() => si.computeCostPerBaseUnit(ingredient)).toThrow(/family|baseUnitType/i);
  });

  it('rejects family mismatch (pcs purchase for WEIGHT ingredient)', () => {
    const { ingredient, si } = pair(
      { purchaseUnit: '12 pcs', purchaseUnitQty: 12, purchaseUnitType: 'pcs' },
      'WEIGHT',
    );
    expect(() => si.computeCostPerBaseUnit(ingredient)).toThrow(/family|baseUnitType/i);
  });

  it('rejects when ingredient.id does not match supplierItem.ingredientId', () => {
    const si = SupplierItem.create(validProps());
    const otherIngredient = weightIngredient();
    expect(() => si.computeCostPerBaseUnit(otherIngredient)).toThrow(/ingredient/i);
  });
});

describe('SupplierItem.applyUpdate', () => {
  it('updates mutable fields', () => {
    const si = SupplierItem.create(validProps());
    si.applyUpdate({
      purchaseUnit: '10 kg sack',
      purchaseUnitQty: 10,
      purchaseUnitType: 'kg',
      unitPrice: 40,
    });
    expect(si.purchaseUnit).toBe('10 kg sack');
    expect(si.purchaseUnitQty).toBe(10);
    expect(si.unitPrice).toBe(40);
  });

  it('refuses to change supplierId or ingredientId (composite identity)', () => {
    const si = SupplierItem.create(validProps());
    expect(() =>
      si.applyUpdate({ supplierId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } as Parameters<typeof si.applyUpdate>[0]),
    ).toThrow(/supplierId|immutable/i);
    expect(() =>
      si.applyUpdate({ ingredientId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } as Parameters<typeof si.applyUpdate>[0]),
    ).toThrow(/ingredientId|immutable/i);
  });

  it('toggles isPreferred via setPreferred()', () => {
    const si = SupplierItem.create(validProps());
    si.setPreferred(true);
    expect(si.isPreferred).toBe(true);
    si.setPreferred(false);
    expect(si.isPreferred).toBe(false);
  });
});
