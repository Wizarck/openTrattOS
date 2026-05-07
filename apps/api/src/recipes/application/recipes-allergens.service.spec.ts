import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, In } from 'typeorm';
import { Ingredient } from '../../ingredients/domain/ingredient.entity';
import { Recipe } from '../../recipes/domain/recipe.entity';
import { RecipeIngredient } from '../../recipes/domain/recipe-ingredient.entity';
import { RECIPE_ALLERGENS_OVERRIDE_CHANGED } from '../../cost/application/cost.events';
import type { AuditEventEnvelope } from '../../audit-log/application/types';
import {
  CrossContaminationMissingTagsError,
  OverrideMissingReasonError,
  RecipeAllergensNotFoundError,
  RecipesAllergensService,
  mergeAllergensOverride,
} from './recipes-allergens.service';

const orgId = '11111111-1111-4111-8111-111111111111';
const otherOrgId = '99999999-9999-4999-8999-999999999999';
const categoryId = '22222222-2222-4222-8222-222222222222';
const actorId = '33333333-3333-4333-8333-333333333333';

function makeIngredient(args: {
  name?: string;
  allergens?: string[];
  dietFlags?: string[];
  organizationId?: string;
} = {}): Ingredient {
  const ing = Ingredient.create({
    organizationId: args.organizationId ?? orgId,
    categoryId,
    name: args.name ?? 'Tomate',
    baseUnitType: 'WEIGHT',
  });
  ing.allergens = args.allergens ?? [];
  ing.dietFlags = args.dietFlags ?? [];
  return ing;
}

function makeRecipe(args: { name?: string; organizationId?: string } = {}): Recipe {
  return Recipe.create({
    organizationId: args.organizationId ?? orgId,
    name: args.name ?? 'Salsa',
    description: 'Test recipe',
    wasteFactor: 0,
  });
}

function makeLine(
  recipeId: string,
  args: { ingredientId?: string; subRecipeId?: string },
): RecipeIngredient {
  return RecipeIngredient.create({
    recipeId,
    ingredientId: args.ingredientId ?? null,
    subRecipeId: args.subRecipeId ?? null,
    quantity: 1,
    unitId: 'kg',
  });
}

interface Stores {
  recipes: Recipe[];
  lines: RecipeIngredient[];
  ingredients: Ingredient[];
}

interface FakeManager {
  getRepository: jest.Mock;
}

function unwrapIn(value: unknown): string[] | null {
  if (value && typeof value === 'object' && '_value' in (value as Record<string, unknown>)) {
    const v = (value as { _value: unknown })._value;
    if (Array.isArray(v)) return v as string[];
  }
  return null;
}

function fakeManager(stores: Stores): FakeManager {
  const make = (entity: unknown) => {
    if (entity === Recipe) {
      return {
        findOneBy: jest.fn(async (where: Partial<Recipe>) =>
          stores.recipes.find(
            (r) =>
              r.id === where.id &&
              (where.organizationId === undefined || r.organizationId === where.organizationId),
          ) ?? null,
        ),
        findBy: jest.fn(async (where: { id?: unknown; organizationId?: string }) => {
          const ids = unwrapIn(where.id);
          if (ids) {
            return stores.recipes.filter(
              (r) =>
                ids.includes(r.id) &&
                (where.organizationId === undefined || r.organizationId === where.organizationId),
            );
          }
          return stores.recipes.filter(
            (r) =>
              where.organizationId === undefined || r.organizationId === where.organizationId,
          );
        }),
        save: jest.fn(async (recipe: Recipe) => {
          const idx = stores.recipes.findIndex((r) => r.id === recipe.id);
          if (idx >= 0) stores.recipes[idx] = recipe;
          else stores.recipes.push(recipe);
          return recipe;
        }),
      };
    }
    if (entity === RecipeIngredient) {
      return {
        findBy: jest.fn(async (where: { recipeId?: string }) =>
          stores.lines.filter((l) => l.recipeId === where.recipeId),
        ),
      };
    }
    if (entity === Ingredient) {
      return {
        findBy: jest.fn(async (where: { id?: unknown }) => {
          const ids = unwrapIn(where.id);
          if (ids) return stores.ingredients.filter((i) => ids.includes(i.id));
          return [];
        }),
      };
    }
    return { findOneBy: jest.fn(), findBy: jest.fn(async () => []), save: jest.fn() };
  };
  return { getRepository: jest.fn((entity: unknown) => make(entity)) };
}

function buildService(stores: Stores): { service: RecipesAllergensService; events: EventEmitter2 } {
  const manager = fakeManager(stores);
  const events = new EventEmitter2();
  const ds = {
    manager,
    getRepository: (entity: unknown) => manager.getRepository(entity),
    transaction: async <T>(fn: (em: typeof manager) => Promise<T>) => fn(manager),
  } as unknown as DataSource;
  const service = new RecipesAllergensService(ds, events);
  return { service, events };
}

// ----------------------------- aggregation -----------------------------

describe('RecipesAllergensService.getAllergensRollup — conservative aggregation', () => {
  it('1.1 unions every allergen across all leaf ingredients (deduped, sorted)', async () => {
    const ing1 = makeIngredient({ name: 'Flour', allergens: ['gluten'] });
    const ing2 = makeIngredient({ name: 'Cream', allergens: ['milk'] });
    const recipe = makeRecipe();
    const lines = [
      makeLine(recipe.id, { ingredientId: ing1.id }),
      makeLine(recipe.id, { ingredientId: ing2.id }),
    ];
    const { service } = buildService({ recipes: [recipe], lines, ingredients: [ing1, ing2] });

    const rollup = await service.getAllergensRollup(orgId, recipe.id);
    expect(rollup.aggregated).toEqual(['gluten', 'milk']);
    expect(rollup.byIngredient[ing1.id]).toEqual(['gluten']);
    expect(rollup.byIngredient[ing2.id]).toEqual(['milk']);
  });

  it('1.2 dedupes a shared allergen across multiple ingredients with full attribution', async () => {
    const ing1 = makeIngredient({ name: 'Cream', allergens: ['milk'] });
    const ing2 = makeIngredient({ name: 'Butter', allergens: ['milk'] });
    const ing3 = makeIngredient({ name: 'Cheese', allergens: ['milk'] });
    const recipe = makeRecipe();
    const lines = [ing1, ing2, ing3].map((i) => makeLine(recipe.id, { ingredientId: i.id }));
    const { service } = buildService({
      recipes: [recipe],
      lines,
      ingredients: [ing1, ing2, ing3],
    });

    const rollup = await service.getAllergensRollup(orgId, recipe.id);
    expect(rollup.aggregated).toEqual(['milk']);
    expect(rollup.byIngredient[ing1.id]).toEqual(['milk']);
    expect(rollup.byIngredient[ing2.id]).toEqual(['milk']);
    expect(rollup.byIngredient[ing3.id]).toEqual(['milk']);
  });

  it('1.3 never auto-clears an allergen — even when only one ingredient carries it', async () => {
    const ing1 = makeIngredient({ name: 'Tomato', allergens: [] });
    const ing2 = makeIngredient({ name: 'Sesame oil', allergens: ['sesame'] });
    const recipe = makeRecipe();
    const lines = [
      makeLine(recipe.id, { ingredientId: ing1.id }),
      makeLine(recipe.id, { ingredientId: ing2.id }),
    ];
    const { service } = buildService({ recipes: [recipe], lines, ingredients: [ing1, ing2] });

    const rollup = await service.getAllergensRollup(orgId, recipe.id);
    expect(rollup.aggregated).toEqual(['sesame']);
    // Both ingredients are listed with their lists (even when empty) for traceability.
    expect(Object.keys(rollup.byIngredient)).toEqual(expect.arrayContaining([ing1.id, ing2.id]));
    expect(rollup.byIngredient[ing1.id]).toEqual([]);
  });
});

describe('RecipesAllergensService.getAllergensRollup — sub-recipe propagation', () => {
  it('2.1 propagates allergens from sub-recipe leaves up to the parent', async () => {
    const ing1 = makeIngredient({ name: 'Egg', allergens: ['eggs'] });
    const ing2 = makeIngredient({ name: 'Soy', allergens: ['soy'] });
    const subRecipe = makeRecipe({ name: 'Mayo' });
    const parent = makeRecipe({ name: 'Aïoli' });
    const subLines = [ing1, ing2].map((i) => makeLine(subRecipe.id, { ingredientId: i.id }));
    const parentLines = [makeLine(parent.id, { subRecipeId: subRecipe.id })];
    const { service } = buildService({
      recipes: [parent, subRecipe],
      lines: [...subLines, ...parentLines],
      ingredients: [ing1, ing2],
    });

    const rollup = await service.getAllergensRollup(orgId, parent.id);
    expect(rollup.aggregated).toEqual(['eggs', 'soy']);
    expect(rollup.byIngredient[ing1.id]).toEqual(['eggs']);
    expect(rollup.byIngredient[ing2.id]).toEqual(['soy']);
  });

  it('2.2 walks two levels of sub-recipes and unions all leaves', async () => {
    const leaf = makeIngredient({ name: 'Wheat', allergens: ['gluten'] });
    const grandSub = makeRecipe({ name: 'GrandSub' });
    const sub = makeRecipe({ name: 'Sub' });
    const parent = makeRecipe({ name: 'Parent' });
    const lines = [
      makeLine(grandSub.id, { ingredientId: leaf.id }),
      makeLine(sub.id, { subRecipeId: grandSub.id }),
      makeLine(parent.id, { subRecipeId: sub.id }),
    ];
    const { service } = buildService({
      recipes: [parent, sub, grandSub],
      lines,
      ingredients: [leaf],
    });

    const rollup = await service.getAllergensRollup(orgId, parent.id);
    expect(rollup.aggregated).toEqual(['gluten']);
    expect(rollup.byIngredient[leaf.id]).toEqual(['gluten']);
  });
});

// ----------------------------- diet flag inference -----------------------------

describe('RecipesAllergensService.getDietFlagsRollup — conservative inference', () => {
  it('3.1 drops the flag if any single ingredient is missing it', async () => {
    const ing1 = makeIngredient({ name: 'A', dietFlags: ['vegan'] });
    const ing2 = makeIngredient({ name: 'B', dietFlags: ['vegan'] });
    const ing3 = makeIngredient({ name: 'C', dietFlags: [] }); // missing vegan
    const recipe = makeRecipe();
    const lines = [ing1, ing2, ing3].map((i) => makeLine(recipe.id, { ingredientId: i.id }));
    const { service } = buildService({
      recipes: [recipe],
      lines,
      ingredients: [ing1, ing2, ing3],
    });

    const rollup = await service.getDietFlagsRollup(orgId, recipe.id);
    expect(rollup.inferred).toEqual([]);
  });

  it('3.2 asserts the flag only when every ingredient carries it AND no contradictions', async () => {
    const ing1 = makeIngredient({ name: 'A', dietFlags: ['vegan'] });
    const ing2 = makeIngredient({ name: 'B', dietFlags: ['vegan'] });
    const recipe = makeRecipe();
    const lines = [ing1, ing2].map((i) => makeLine(recipe.id, { ingredientId: i.id }));
    const { service } = buildService({
      recipes: [recipe],
      lines,
      ingredients: [ing1, ing2],
    });

    const rollup = await service.getDietFlagsRollup(orgId, recipe.id);
    expect(rollup.inferred).toEqual(['vegan']);
    expect(rollup.warnings).toEqual([]);
  });
});

describe('RecipesAllergensService.getDietFlagsRollup — contradiction handling', () => {
  it('4.1 drops vegan when an ingredient carries the milk allergen + emits warning', async () => {
    const ing1 = makeIngredient({ name: 'A', dietFlags: ['vegan'] });
    const ing2 = makeIngredient({ name: 'B', dietFlags: ['vegan'], allergens: ['milk'] });
    const recipe = makeRecipe();
    const lines = [ing1, ing2].map((i) => makeLine(recipe.id, { ingredientId: i.id }));
    const { service } = buildService({
      recipes: [recipe],
      lines,
      ingredients: [ing1, ing2],
    });

    const rollup = await service.getDietFlagsRollup(orgId, recipe.id);
    expect(rollup.inferred).toEqual([]);
    expect(rollup.warnings).toHaveLength(1);
    expect(rollup.warnings[0]).toMatch(/vegan/);
    expect(rollup.warnings[0]).toMatch(/milk/);
  });

  it('4.2 drops gluten-free when gluten is present + leaves vegetarian intact', async () => {
    const ing1 = makeIngredient({
      name: 'A',
      dietFlags: ['vegetarian', 'gluten-free'],
      allergens: ['gluten'],
    });
    const ing2 = makeIngredient({ name: 'B', dietFlags: ['vegetarian', 'gluten-free'] });
    const recipe = makeRecipe();
    const lines = [ing1, ing2].map((i) => makeLine(recipe.id, { ingredientId: i.id }));
    const { service } = buildService({
      recipes: [recipe],
      lines,
      ingredients: [ing1, ing2],
    });

    const rollup = await service.getDietFlagsRollup(orgId, recipe.id);
    expect(rollup.inferred).toEqual(['vegetarian']);
    expect(rollup.warnings.some((w) => /gluten-free/.test(w))).toBe(true);
  });
});

// ----------------------------- override merge -----------------------------

describe('mergeAllergensOverride — final list = (aggregated ∪ add) − remove', () => {
  it('5.1 returns sorted aggregated when override is null', () => {
    expect(mergeAllergensOverride(['milk', 'gluten'], null)).toEqual(['gluten', 'milk']);
  });

  it('5.2 adds + removes correctly and returns sorted output', () => {
    const result = mergeAllergensOverride(['milk', 'gluten'], {
      add: ['sesame'],
      remove: ['gluten'],
      reason: 'audit',
      appliedBy: actorId,
      appliedAt: '2026-05-04T10:00:00.000Z',
    });
    expect(result).toEqual(['milk', 'sesame']);
  });

  it('5.3 add wins over a stale aggregated set (no double-counting)', () => {
    const result = mergeAllergensOverride(['milk'], {
      add: ['milk', 'eggs'],
      remove: [],
      reason: 'audit',
      appliedBy: actorId,
      appliedAt: '2026-05-04T10:00:00.000Z',
    });
    expect(result).toEqual(['eggs', 'milk']);
  });
});

describe('RecipesAllergensService — override merge in the rollup response', () => {
  it('5.4 merges Manager+ override into the aggregated field with attribution preserved', async () => {
    const ing = makeIngredient({ name: 'Flour', allergens: ['gluten'] });
    const recipe = makeRecipe();
    recipe.aggregatedAllergensOverride = {
      add: ['sesame'],
      remove: [],
      reason: 'Sesame oil added in finishing step',
      appliedBy: actorId,
      appliedAt: '2026-05-04T10:00:00.000Z',
    };
    const lines = [makeLine(recipe.id, { ingredientId: ing.id })];
    const { service } = buildService({ recipes: [recipe], lines, ingredients: [ing] });

    const rollup = await service.getAllergensRollup(orgId, recipe.id);
    expect(rollup.aggregated).toEqual(['gluten', 'sesame']);
    expect(rollup.byIngredient[ing.id]).toEqual(['gluten']); // attribution preserved
    expect(rollup.override?.reason).toBe('Sesame oil added in finishing step');
    expect(rollup.override?.appliedBy).toBe(actorId);
  });
});

// ----------------------------- cross-contamination -----------------------------

describe('RecipesAllergensService.applyCrossContamination — both note + tags required', () => {
  it('6.1 rejects free text without structured tags', async () => {
    const recipe = makeRecipe();
    const { service } = buildService({ recipes: [recipe], lines: [], ingredients: [] });

    await expect(
      service.applyCrossContamination(orgId, actorId, recipe.id, {
        note: 'Free-text only, no tags',
        allergens: [],
      }),
    ).rejects.toBeInstanceOf(CrossContaminationMissingTagsError);
  });

  it('6.2 persists both note + tags when both are provided', async () => {
    const recipe = makeRecipe();
    const { service } = buildService({ recipes: [recipe], lines: [], ingredients: [] });

    const saved = await service.applyCrossContamination(orgId, actorId, recipe.id, {
      note: 'Made on shared line with peanuts',
      allergens: ['peanuts'],
    });
    expect(saved.crossContaminationNote).toBe('Made on shared line with peanuts');
    expect(saved.crossContaminationAllergens).toEqual(['peanuts']);
  });
});

// ----------------------------- event emission -----------------------------

describe('RecipesAllergensService — apply* methods emit RECIPE_ALLERGENS_OVERRIDE_CHANGED', () => {
  it('7.1 applyAllergensOverride emits envelope with payloadAfter.kind=allergens-override', async () => {
    const recipe = makeRecipe();
    const { service, events } = buildService({ recipes: [recipe], lines: [], ingredients: [] });
    const captured: AuditEventEnvelope[] = [];
    events.on(RECIPE_ALLERGENS_OVERRIDE_CHANGED, (e: AuditEventEnvelope) => {
      captured.push(e);
    });

    await service.applyAllergensOverride(orgId, actorId, recipe.id, {
      add: ['sesame'],
      remove: [],
      reason: 'audit',
    });
    expect(captured).toHaveLength(1);
    expect((captured[0].payloadAfter as { kind: string }).kind).toBe('allergens-override');
    expect(captured[0].aggregateType).toBe('recipe');
    expect(captured[0].aggregateId).toBe(recipe.id);
    expect(captured[0].actorUserId).toBe(actorId);
    expect(captured[0].actorKind).toBe('user');
  });

  it('7.2 applyDietFlagsOverride emits envelope with payloadAfter.kind=diet-flags-override', async () => {
    const recipe = makeRecipe();
    const { service, events } = buildService({ recipes: [recipe], lines: [], ingredients: [] });
    const captured: AuditEventEnvelope[] = [];
    events.on(RECIPE_ALLERGENS_OVERRIDE_CHANGED, (e: AuditEventEnvelope) => {
      captured.push(e);
    });

    await service.applyDietFlagsOverride(orgId, actorId, recipe.id, {
      flags: ['vegan'],
      reason: 'certified vegan supplier',
    });
    expect(captured).toHaveLength(1);
    expect((captured[0].payloadAfter as { kind: string }).kind).toBe('diet-flags-override');
  });

  it('7.3 applyCrossContamination emits envelope with payloadAfter.kind=cross-contamination', async () => {
    const recipe = makeRecipe();
    const { service, events } = buildService({ recipes: [recipe], lines: [], ingredients: [] });
    const captured: AuditEventEnvelope[] = [];
    events.on(RECIPE_ALLERGENS_OVERRIDE_CHANGED, (e: AuditEventEnvelope) => {
      captured.push(e);
    });

    await service.applyCrossContamination(orgId, actorId, recipe.id, {
      note: 'shared line',
      allergens: ['peanuts'],
    });
    expect(captured).toHaveLength(1);
    expect((captured[0].payloadAfter as { kind: string }).kind).toBe('cross-contamination');
  });
});

// ----------------------------- reason validation -----------------------------

describe('RecipesAllergensService — reason validation on overrides', () => {
  it('8.1 applyAllergensOverride rejects empty reason', async () => {
    const recipe = makeRecipe();
    const { service } = buildService({ recipes: [recipe], lines: [], ingredients: [] });
    await expect(
      service.applyAllergensOverride(orgId, actorId, recipe.id, {
        add: ['sesame'],
        remove: [],
        reason: '   ',
      }),
    ).rejects.toBeInstanceOf(OverrideMissingReasonError);
  });

  it('8.2 applyDietFlagsOverride rejects empty reason', async () => {
    const recipe = makeRecipe();
    const { service } = buildService({ recipes: [recipe], lines: [], ingredients: [] });
    await expect(
      service.applyDietFlagsOverride(orgId, actorId, recipe.id, {
        flags: ['vegan'],
        reason: '',
      }),
    ).rejects.toBeInstanceOf(OverrideMissingReasonError);
  });
});

// ----------------------------- not-found surface -----------------------------

describe('RecipesAllergensService — RecipeAllergensNotFoundError', () => {
  it('9.1 throws when the recipe is not in the org', async () => {
    const recipe = makeRecipe({ organizationId: otherOrgId });
    const { service } = buildService({ recipes: [recipe], lines: [], ingredients: [] });
    await expect(service.getAllergensRollup(orgId, recipe.id)).rejects.toBeInstanceOf(
      RecipeAllergensNotFoundError,
    );
  });
});

// silence unused import warning for In (kept to mirror cost.service.spec ergonomics)
void In;
