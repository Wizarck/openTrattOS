import { EntityManager } from 'typeorm';
import { Recipe } from '../domain/recipe.entity';
import { RecipeIngredient } from '../domain/recipe-ingredient.entity';
import {
  LeafContext,
  RecipeTreeCycleError,
  RecipeTreeDepthLimitError,
  RecipeTreeRecipeNotFoundError,
  walkRecipeTree,
} from './recipe-tree-walker';

const orgId = '11111111-1111-4111-8111-111111111111';

interface FakeRow {
  recipe: Recipe;
  lines: RecipeIngredient[];
}

function makeRecipe(id: string, name: string, wasteFactor = 0): Recipe {
  const r = new Recipe();
  r.id = id;
  r.organizationId = orgId;
  r.name = name;
  r.description = '';
  r.wasteFactor = wasteFactor as unknown as number;
  r.isActive = true;
  return r;
}

function makeIngredientLine(
  id: string,
  recipeId: string,
  ingredientId: string,
  quantity: number,
  yieldOverride: number | null = null,
): RecipeIngredient {
  const line = new RecipeIngredient();
  line.id = id;
  line.recipeId = recipeId;
  line.ingredientId = ingredientId;
  line.subRecipeId = null;
  line.quantity = quantity as unknown as number;
  line.unitId = 'g';
  line.yieldPercentOverride = yieldOverride as unknown as number | null;
  line.sourceOverrideRef = null;
  return line;
}

function makeSubRecipeLine(
  id: string,
  recipeId: string,
  subRecipeId: string,
  quantity: number,
  yieldOverride: number | null = null,
): RecipeIngredient {
  const line = new RecipeIngredient();
  line.id = id;
  line.recipeId = recipeId;
  line.ingredientId = null;
  line.subRecipeId = subRecipeId;
  line.quantity = quantity as unknown as number;
  line.unitId = 'g';
  line.yieldPercentOverride = yieldOverride as unknown as number | null;
  line.sourceOverrideRef = null;
  return line;
}

function makeFakeEm(rows: Record<string, FakeRow>): EntityManager {
  const em = {
    getRepository: (entity: unknown) => {
      if (entity === Recipe) {
        return {
          findOneBy: async (where: { id: string; organizationId: string }) => {
            const row = rows[where.id];
            if (!row) return null;
            return row.recipe.organizationId === where.organizationId ? row.recipe : null;
          },
        };
      }
      if (entity === RecipeIngredient) {
        return {
          findBy: async (where: { recipeId: string }) => {
            const row = rows[where.recipeId];
            return row ? row.lines : [];
          },
        };
      }
      throw new Error(`Unexpected entity: ${String(entity)}`);
    },
  };
  return em as unknown as EntityManager;
}

describe('walkRecipeTree', () => {
  const r1 = '22222222-2222-4222-8222-222222222221';
  const r2 = '22222222-2222-4222-8222-222222222222';
  const r3 = '22222222-2222-4222-8222-222222222223';
  const i1 = '33333333-3333-4333-8333-333333333331';
  const i2 = '33333333-3333-4333-8333-333333333332';

  it('throws RecipeTreeRecipeNotFoundError when root recipe is missing', async () => {
    const em = makeFakeEm({});
    await expect(walkRecipeTree(em, orgId, r1, () => undefined)).rejects.toBeInstanceOf(
      RecipeTreeRecipeNotFoundError,
    );
  });

  it('invokes onLeaf for each ingredient line on a flat recipe', async () => {
    const em = makeFakeEm({
      [r1]: {
        recipe: makeRecipe(r1, 'Pesto'),
        lines: [
          makeIngredientLine('l1', r1, i1, 50),
          makeIngredientLine('l2', r1, i2, 30),
        ],
      },
    });
    const visits: string[] = [];
    await walkRecipeTree(em, orgId, r1, (ctx) => {
      visits.push(ctx.line.ingredientId!);
    });
    expect(visits).toEqual([i1, i2]);
  });

  it('recurses into sub-recipes and reports leaves at the right depth', async () => {
    const em = makeFakeEm({
      [r1]: {
        recipe: makeRecipe(r1, 'Tagliatelle ragù'),
        lines: [makeSubRecipeLine('l1', r1, r2, 1)],
      },
      [r2]: {
        recipe: makeRecipe(r2, 'Ragù base'),
        lines: [makeIngredientLine('l2', r2, i1, 200)],
      },
    });
    const visits: LeafContext[] = [];
    await walkRecipeTree(em, orgId, r1, (ctx) => {
      visits.push(ctx);
    });
    expect(visits).toHaveLength(1);
    expect(visits[0].line.ingredientId).toBe(i1);
    expect(visits[0].depth).toBe(1);
  });

  it('multiplies scaledQuantity through the sub-recipe quantity chain', async () => {
    const em = makeFakeEm({
      [r1]: {
        recipe: makeRecipe(r1, 'Outer'),
        lines: [makeSubRecipeLine('l1', r1, r2, 3)], // outer line uses 3 of sub-recipe
      },
      [r2]: {
        recipe: makeRecipe(r2, 'Inner'),
        lines: [makeIngredientLine('l2', r2, i1, 50)], // inner uses 50g
      },
    });
    const visits: LeafContext[] = [];
    await walkRecipeTree(em, orgId, r1, (ctx) => {
      visits.push(ctx);
    });
    // scaledQuantity = 50 × 3 = 150
    expect(visits[0].scaledQuantity).toBe(150);
  });

  it('multiplies cumulativeYieldWaste through the chain (no waste)', async () => {
    const em = makeFakeEm({
      [r1]: {
        recipe: makeRecipe(r1, 'Outer'),
        lines: [makeSubRecipeLine('l1', r1, r2, 1, 0.9)],
      },
      [r2]: {
        recipe: makeRecipe(r2, 'Inner'),
        lines: [makeIngredientLine('l2', r2, i1, 100, 1)],
      },
    });
    const visits: LeafContext[] = [];
    await walkRecipeTree(em, orgId, r1, (ctx) => {
      visits.push(ctx);
    });
    // cumulativeYieldWaste = 0.9 (sub yieldOverride) × 1 (no inner waste) × 1 (inner yieldOverride 1) × 1 (no outer waste)
    expect(visits[0].cumulativeYieldWaste).toBeCloseTo(0.9, 5);
  });

  it('applies parent recipe wasteFactor in cumulative chain', async () => {
    const em = makeFakeEm({
      [r1]: {
        recipe: makeRecipe(r1, 'Wasteful', 0.1),
        lines: [makeIngredientLine('l1', r1, i1, 100, 1)],
      },
    });
    const visits: LeafContext[] = [];
    await walkRecipeTree(em, orgId, r1, (ctx) => {
      visits.push(ctx);
    });
    // 1 (yield) × (1 − 0.1) = 0.9
    expect(visits[0].cumulativeYieldWaste).toBeCloseTo(0.9, 5);
  });

  it('throws RecipeTreeCycleError on direct self-reference', async () => {
    const em = makeFakeEm({
      [r1]: {
        recipe: makeRecipe(r1, 'CircularA'),
        lines: [makeSubRecipeLine('l1', r1, r1, 1)],
      },
    });
    await expect(walkRecipeTree(em, orgId, r1, () => undefined)).rejects.toBeInstanceOf(
      RecipeTreeCycleError,
    );
  });

  it('throws RecipeTreeCycleError on indirect cycle (A → B → A)', async () => {
    const em = makeFakeEm({
      [r1]: {
        recipe: makeRecipe(r1, 'A'),
        lines: [makeSubRecipeLine('l1', r1, r2, 1)],
      },
      [r2]: {
        recipe: makeRecipe(r2, 'B'),
        lines: [makeSubRecipeLine('l2', r2, r1, 1)],
      },
    });
    await expect(walkRecipeTree(em, orgId, r1, () => undefined)).rejects.toBeInstanceOf(
      RecipeTreeCycleError,
    );
  });

  it('throws RecipeTreeDepthLimitError when depth exceeds cap', async () => {
    // Build a chain r1 → r2 → r3 with depthCap=1 (root depth=0; r2=1; r3=2 should overflow)
    const em = makeFakeEm({
      [r1]: { recipe: makeRecipe(r1, 'A'), lines: [makeSubRecipeLine('l1', r1, r2, 1)] },
      [r2]: { recipe: makeRecipe(r2, 'B'), lines: [makeSubRecipeLine('l2', r2, r3, 1)] },
      [r3]: { recipe: makeRecipe(r3, 'C'), lines: [makeIngredientLine('l3', r3, i1, 50)] },
    });
    await expect(
      walkRecipeTree(em, orgId, r1, () => undefined, { depthCap: 1 }),
    ).rejects.toBeInstanceOf(RecipeTreeDepthLimitError);
  });

  it('honours custom depthCap option without throwing when within bounds', async () => {
    const em = makeFakeEm({
      [r1]: { recipe: makeRecipe(r1, 'A'), lines: [makeSubRecipeLine('l1', r1, r2, 1)] },
      [r2]: { recipe: makeRecipe(r2, 'B'), lines: [makeIngredientLine('l2', r2, i1, 50)] },
    });
    await expect(
      walkRecipeTree(em, orgId, r1, () => undefined, { depthCap: 5 }),
    ).resolves.toBeUndefined();
  });

  it('handles mixed ingredient + sub-recipe lines in the same parent', async () => {
    const em = makeFakeEm({
      [r1]: {
        recipe: makeRecipe(r1, 'Mixed'),
        lines: [
          makeIngredientLine('l1', r1, i1, 100),
          makeSubRecipeLine('l2', r1, r2, 1),
          makeIngredientLine('l3', r1, i2, 50),
        ],
      },
      [r2]: {
        recipe: makeRecipe(r2, 'Sub'),
        lines: [makeIngredientLine('l4', r2, i1, 25)],
      },
    });
    const visits: string[] = [];
    await walkRecipeTree(em, orgId, r1, (ctx) => {
      visits.push(ctx.line.ingredientId!);
    });
    expect(visits).toEqual([i1, i1, i2]); // i1 (parent), i1 (sub), i2 (parent)
  });
});
