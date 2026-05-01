import { Category } from '../domain/category.entity';
import { CategoryResolver, IngredientCsvRow, IngredientRowValidator } from './ingredient-row-validator';

const orgId = '11111111-1111-4111-8111-111111111111';

function mkCat(props: Partial<Category> & { name: string; id?: string; parentId?: string | null }): Category {
  const c = Object.create(Category.prototype) as Category;
  Object.assign(c, {
    id: props.id ?? '00000000-0000-4000-8000-000000000000',
    organizationId: orgId,
    parentId: props.parentId ?? null,
    name: props.name,
    nameEs: props.name,
    nameEn: props.name,
    sortOrder: 0,
    isDefault: true,
    createdBy: null,
    updatedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return c;
}

const root = mkCat({ id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', name: 'fresh' });
const veg = mkCat({ id: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb', name: 'vegetables', parentId: root.id });
const meat = mkCat({ id: 'cccccccc-3333-4333-8333-cccccccccccc', name: 'meat-poultry', parentId: root.id });
const dryRoot = mkCat({ id: 'dddddddd-4444-4444-8444-dddddddddddd', name: 'dry-pantry' });
const oils = mkCat({ id: 'eeeeeeee-5555-4555-8555-eeeeeeeeeeee', name: 'oils-vinegars', parentId: dryRoot.id });
// duplicate name under different parents → ambiguous
const ambigA = mkCat({ id: 'ffffffff-6666-4666-8666-ffffffffffff', name: 'eggs', parentId: root.id });
const ambigB = mkCat({ id: '99999999-7777-4777-8777-999999999999', name: 'eggs', parentId: dryRoot.id });

const allCats = [root, veg, meat, dryRoot, oils, ambigA, ambigB];

const validRow = (overrides: Partial<IngredientCsvRow> = {}): IngredientCsvRow => ({
  name: 'Tomate Pera',
  categoryName: 'vegetables',
  baseUnitType: 'WEIGHT',
  ...overrides,
});

describe('CategoryResolver', () => {
  const r = new CategoryResolver(allCats);

  it('resolves a unique flat name', () => {
    const out = r.resolve('vegetables');
    expect(out).toEqual({ ok: true, categoryId: veg.id });
  });

  it('case-insensitive flat name', () => {
    const out = r.resolve('VEGETABLES');
    expect(out).toEqual({ ok: true, categoryId: veg.id });
  });

  it('reports ambiguous flat name with hint', () => {
    const out = r.resolve('eggs');
    expect(out).toEqual({
      ok: false,
      code: 'CATEGORY_AMBIGUOUS_NAME',
      hint: expect.stringMatching(/slug path/i),
    });
  });

  it('resolves a slug-path', () => {
    const out = r.resolve('dry-pantry/oils-vinegars');
    expect(out).toEqual({ ok: true, categoryId: oils.id });
  });

  it('case-insensitive slug-path', () => {
    const out = r.resolve('Dry-Pantry/Oils-Vinegars');
    expect(out).toEqual({ ok: true, categoryId: oils.id });
  });

  it('disambiguates ambiguous flat name via slug path', () => {
    const out = r.resolve('fresh/eggs');
    expect(out).toEqual({ ok: true, categoryId: ambigA.id });
  });

  it('reports miss for unknown name', () => {
    expect(r.resolve('nonexistent')).toEqual({ ok: false, code: 'CATEGORY_NOT_FOUND' });
  });

  it('reports miss for empty / whitespace', () => {
    expect(r.resolve('')).toEqual({ ok: false, code: 'CATEGORY_NOT_FOUND' });
    expect(r.resolve('   ')).toEqual({ ok: false, code: 'CATEGORY_NOT_FOUND' });
  });

  it('reports miss for partial slug match', () => {
    expect(r.resolve('dry-pantry/missing')).toEqual({ ok: false, code: 'CATEGORY_NOT_FOUND' });
  });
});

describe('IngredientRowValidator', () => {
  const resolver = new CategoryResolver(allCats);
  const v = new IngredientRowValidator(orgId, resolver);

  it('validates a clean row → ok with built Ingredient', () => {
    const out = v.validate(validRow(), 1);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.ingredient.name).toBe('Tomate Pera');
      expect(out.ingredient.organizationId).toBe(orgId);
      expect(out.ingredient.categoryId).toBe(veg.id);
      expect(out.ingredient.baseUnitType).toBe('WEIGHT');
      expect(out.ingredient.internalCode.length).toBeGreaterThan(0);
    }
  });

  it('uses provided internalCode when non-blank', () => {
    const out = v.validate(validRow({ internalCode: 'TOM-001' }), 1);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.ingredient.internalCode).toBe('TOM-001');
  });

  it('autogen when internalCode is blank/whitespace', () => {
    const out = v.validate(validRow({ internalCode: '   ' }), 1);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.ingredient.internalCode.length).toBeGreaterThan(0);
  });

  it('rejects empty name', () => {
    const out = v.validate(validRow({ name: '' }), 5);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rowIndex: 5, column: 'name', code: 'INGREDIENT_NAME_REQUIRED' }),
        ]),
      );
    }
  });

  it('rejects unknown baseUnitType', () => {
    const out = v.validate(validRow({ baseUnitType: 'COUNT' }), 7);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ column: 'baseUnitType', code: 'INGREDIENT_INVALID_BASE_UNIT_TYPE' }),
        ]),
      );
    }
  });

  it('rejects missing categoryName', () => {
    const out = v.validate(validRow({ categoryName: '' }), 9);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ column: 'categoryName', code: 'CATEGORY_NOT_FOUND' }),
        ]),
      );
    }
  });

  it('rejects ambiguous categoryName with the slug-path hint', () => {
    const out = v.validate(validRow({ categoryName: 'eggs' }), 11);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            column: 'categoryName',
            code: 'CATEGORY_AMBIGUOUS_NAME',
          }),
        ]),
      );
    }
  });

  it('rejects negative densityFactor', () => {
    const out = v.validate(validRow({ densityFactor: '-1' }), 13);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ column: 'densityFactor', code: 'INGREDIENT_DENSITY_NON_POSITIVE' }),
        ]),
      );
    }
  });

  it('rejects density on UNIT-family ingredient', () => {
    const out = v.validate(validRow({ baseUnitType: 'UNIT', densityFactor: '0.92' }), 15);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            column: 'densityFactor',
            code: 'INGREDIENT_DENSITY_FORBIDDEN_FOR_UNIT',
          }),
        ]),
      );
    }
  });

  it('accepts blank densityFactor as not-provided', () => {
    const out = v.validate(validRow({ densityFactor: '' }), 17);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.ingredient.densityFactor).toBeNull();
  });

  it('accumulates multiple errors per row', () => {
    const out = v.validate(
      validRow({ name: '', categoryName: 'nonexistent', baseUnitType: 'XYZ' }),
      19,
    );
    expect(out.ok).toBe(false);
    if (!out.ok) {
      const codes = out.errors.map((e) => e.code).sort();
      expect(codes).toEqual(
        expect.arrayContaining([
          'CATEGORY_NOT_FOUND',
          'INGREDIENT_INVALID_BASE_UNIT_TYPE',
          'INGREDIENT_NAME_REQUIRED',
        ]),
      );
    }
  });
});
