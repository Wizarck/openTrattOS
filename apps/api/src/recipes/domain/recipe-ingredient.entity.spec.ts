import { RecipeIngredient, RecipeIngredientCreateProps } from './recipe-ingredient.entity';

const recipeId = '11111111-1111-4111-8111-111111111111';
const ingredientId = '22222222-2222-4222-8222-222222222222';
const subRecipeId = '33333333-3333-4333-8333-333333333333';
const validProps = (
  overrides: Partial<RecipeIngredientCreateProps> = {},
): RecipeIngredientCreateProps => ({
  recipeId,
  ingredientId,
  subRecipeId: null,
  quantity: 0.25,
  unitId: 'kg',
  ...overrides,
});

describe('RecipeIngredient.create', () => {
  it('returns a row with UUID id pointing to an Ingredient', () => {
    const ri = RecipeIngredient.create(validProps());
    expect(ri.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(ri.recipeId).toBe(recipeId);
    expect(ri.ingredientId).toBe(ingredientId);
    expect(ri.subRecipeId).toBeNull();
    expect(ri.quantity).toBe(0.25);
    expect(ri.unitId).toBe('kg');
    expect(ri.yieldPercentOverride).toBeNull();
    expect(ri.sourceOverrideRef).toBeNull();
  });

  it('returns a row pointing to a sub-Recipe', () => {
    const ri = RecipeIngredient.create(
      validProps({ ingredientId: null, subRecipeId }),
    );
    expect(ri.ingredientId).toBeNull();
    expect(ri.subRecipeId).toBe(subRecipeId);
  });

  it('rejects when both ingredientId and subRecipeId are non-null', () => {
    expect(() =>
      RecipeIngredient.create(validProps({ ingredientId, subRecipeId })),
    ).toThrow(/exactly one|both/i);
  });

  it('rejects when both ingredientId and subRecipeId are null', () => {
    expect(() =>
      RecipeIngredient.create(validProps({ ingredientId: null, subRecipeId: null })),
    ).toThrow(/exactly one|neither/i);
  });

  it.each([0, -1, NaN, Infinity])('rejects non-positive quantity %s', (q) => {
    expect(() => RecipeIngredient.create(validProps({ quantity: q as number }))).toThrow(/quantity/i);
  });

  it('rejects empty unitId', () => {
    expect(() => RecipeIngredient.create(validProps({ unitId: '' }))).toThrow(/unitId/i);
  });

  it('accepts optional yieldPercentOverride in [0, 1]', () => {
    const ri = RecipeIngredient.create(validProps({ yieldPercentOverride: 0.92 }));
    expect(ri.yieldPercentOverride).toBe(0.92);
  });

  it.each([-0.1, 1.01, 1.5, NaN])('rejects yieldPercentOverride out of range: %s', (y) => {
    expect(() =>
      RecipeIngredient.create(validProps({ yieldPercentOverride: y as number })),
    ).toThrow(/yieldPercentOverride/i);
  });

  it('accepts optional sourceOverrideRef', () => {
    const ri = RecipeIngredient.create(
      validProps({ sourceOverrideRef: 'supplier-item:abc-123' }),
    );
    expect(ri.sourceOverrideRef).toBe('supplier-item:abc-123');
  });

  it('rejects non-uuid recipeId', () => {
    expect(() => RecipeIngredient.create(validProps({ recipeId: 'nope' }))).toThrow(/recipeId|uuid/i);
  });

  it('rejects non-uuid ingredientId when provided', () => {
    expect(() =>
      RecipeIngredient.create(validProps({ ingredientId: 'nope' })),
    ).toThrow(/ingredientId|uuid/i);
  });

  it('rejects non-uuid subRecipeId when provided', () => {
    expect(() =>
      RecipeIngredient.create(validProps({ ingredientId: null, subRecipeId: 'nope' })),
    ).toThrow(/subRecipeId|uuid/i);
  });
});

describe('RecipeIngredient.applyUpdate', () => {
  it('updates mutable fields (quantity, unitId, yield, source override)', () => {
    const ri = RecipeIngredient.create(validProps());
    ri.applyUpdate({
      quantity: 0.5,
      unitId: 'g',
      yieldPercentOverride: 0.85,
      sourceOverrideRef: 'supplier-item:xyz-999',
    });
    expect(ri.quantity).toBe(0.5);
    expect(ri.unitId).toBe('g');
    expect(ri.yieldPercentOverride).toBe(0.85);
    expect(ri.sourceOverrideRef).toBe('supplier-item:xyz-999');
  });

  it('refuses to change recipeId', () => {
    const ri = RecipeIngredient.create(validProps());
    expect(() =>
      ri.applyUpdate({ recipeId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } as Parameters<typeof ri.applyUpdate>[0]),
    ).toThrow(/recipeId|immutable/i);
  });

  it('refuses to swap ingredientId↔subRecipeId (composite identity)', () => {
    const ri = RecipeIngredient.create(validProps());
    expect(() =>
      ri.applyUpdate({ ingredientId: null, subRecipeId } as Parameters<typeof ri.applyUpdate>[0]),
    ).toThrow(/ingredientId|subRecipeId|immutable/i);
  });
});
