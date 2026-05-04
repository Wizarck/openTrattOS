import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { Ingredient } from '../../ingredients/domain/ingredient.entity';
import { Recipe } from '../../recipes/domain/recipe.entity';
import { RecipeIngredient } from '../../recipes/domain/recipe-ingredient.entity';
import { CostRecipeNotFoundError, CostService } from './cost.service';
import { InventoryCostResolver, ResolvedCost } from '../inventory-cost-resolver';
import { RecipeCostHistoryRepository } from '../infrastructure/recipe-cost-history.repository';

const orgId = '11111111-1111-4111-8111-111111111111';
const categoryId = '22222222-2222-4222-8222-222222222222';

function makeIngredient(name = 'Tomate'): Ingredient {
  return Ingredient.create({
    organizationId: orgId,
    categoryId,
    name,
    baseUnitType: 'WEIGHT',
  });
}

function makeRecipe(name = 'Salsa', wasteFactor = 0): Recipe {
  return Recipe.create({
    organizationId: orgId,
    name,
    description: 'Test recipe',
    wasteFactor,
  });
}

function makeLine(
  recipeId: string,
  args: { ingredientId?: string; subRecipeId?: string; quantity: number; unitId: string; yieldOverride?: number; sourceOverrideRef?: string | null },
): RecipeIngredient {
  return RecipeIngredient.create({
    recipeId,
    ingredientId: args.ingredientId ?? null,
    subRecipeId: args.subRecipeId ?? null,
    quantity: args.quantity,
    unitId: args.unitId,
    yieldPercentOverride: args.yieldOverride ?? null,
    sourceOverrideRef: args.sourceOverrideRef ?? null,
  });
}

function buildResolved(refId: string, costPerBaseUnit: number): ResolvedCost {
  return {
    costPerBaseUnit,
    currency: 'EUR',
    source: { kind: 'supplier-item', refId, displayLabel: 'mock' },
  };
}

interface FakeManager {
  getRepository: jest.Mock;
}

function fakeManager(stores: { recipes: Recipe[]; lines: RecipeIngredient[]; ingredients: Ingredient[] }): FakeManager {
  const make = (entity: unknown) => {
    if (entity === Recipe) {
      return {
        findOneBy: jest.fn(async (where: Partial<Recipe>) =>
          stores.recipes.find((r) => r.id === where.id && (where.organizationId === undefined || r.organizationId === where.organizationId)) ?? null,
        ),
        findBy: jest.fn(async (where: { id?: { _value?: string[] }; organizationId?: string }) => {
          // Fake In() — TypeORM's In() yields a FindOperator; we simulate by reading its `value` if present.
          if (where.id && Array.isArray((where.id as unknown as { _value?: unknown[] })._value)) {
            const ids = (where.id as unknown as { _value: string[] })._value;
            return stores.recipes.filter((r) => ids.includes(r.id) && (where.organizationId === undefined || r.organizationId === where.organizationId));
          }
          return stores.recipes.filter((r) => (where.organizationId === undefined || r.organizationId === where.organizationId));
        }),
      };
    }
    if (entity === RecipeIngredient) {
      return {
        findBy: jest.fn(async (where: { recipeId?: string; id?: { _value?: string[] } }) => {
          if (where.id && Array.isArray((where.id as unknown as { _value?: unknown[] })._value)) {
            const ids = (where.id as unknown as { _value: string[] })._value;
            return stores.lines.filter((l) => ids.includes(l.id));
          }
          return stores.lines.filter((l) => l.recipeId === where.recipeId);
        }),
      };
    }
    if (entity === Ingredient) {
      return {
        findBy: jest.fn(async (where: { id?: { _value?: string[] } }) => {
          if (where.id && Array.isArray((where.id as unknown as { _value?: unknown[] })._value)) {
            const ids = (where.id as unknown as { _value: string[] })._value;
            return stores.ingredients.filter((i) => ids.includes(i.id));
          }
          return [];
        }),
      };
    }
    return { findOneBy: jest.fn(), findBy: jest.fn(async () => []), save: jest.fn() };
  };
  return { getRepository: jest.fn((entity: unknown) => make(entity)) } satisfies FakeManager;
}

function buildService(opts: {
  resolver: InventoryCostResolver;
  manager: FakeManager;
}): CostService {
  const ds = {
    manager: opts.manager,
    getRepository: (entity: unknown) => opts.manager.getRepository(entity),
    transaction: async <T>(fn: (em: typeof opts.manager) => Promise<T>) => fn(opts.manager),
  } as unknown as DataSource;
  const history = {
    findInWindow: jest.fn(async () => []),
    findLatestForRecipe: jest.fn(async () => []),
  } as unknown as RecipeCostHistoryRepository;
  const events = new EventEmitter2();
  return new CostService(ds, opts.resolver, history, events);
}

describe('CostService.computeRecipeCost', () => {
  it('computes a flat recipe with one ingredient line', async () => {
    const ingredient = makeIngredient();
    const recipe = makeRecipe('Salsa', 0);
    const line = makeLine(recipe.id, { ingredientId: ingredient.id, quantity: 0.5, unitId: 'kg' });

    const resolver: InventoryCostResolver = {
      resolveBaseCost: jest.fn(async () => buildResolved('si-1', 0.005)),
    };
    const manager = fakeManager({ recipes: [recipe], lines: [line], ingredients: [ingredient] });
    const service = buildService({ resolver, manager });

    const breakdown = await service.computeRecipeCost(orgId, recipe.id);
    // 0.5 kg = 500 g; 500 × 0.005 × 1 × (1-0) = 2.5
    expect(breakdown.totalCost).toBe(2.5);
    expect(breakdown.components).toHaveLength(1);
    expect(breakdown.components[0].lineCost).toBe(2.5);
    expect(breakdown.components[0].sourceRefId).toBe('si-1');
    expect(breakdown.currency).toBe('EUR');
  });

  it('applies yield × (1 − waste) per level', async () => {
    const ingredient = makeIngredient();
    const recipe = makeRecipe('Salsa', 0.1);
    const line = makeLine(recipe.id, { ingredientId: ingredient.id, quantity: 1, unitId: 'kg', yieldOverride: 0.8 });

    const resolver: InventoryCostResolver = {
      resolveBaseCost: jest.fn(async () => buildResolved('si-1', 0.01)),
    };
    const manager = fakeManager({ recipes: [recipe], lines: [line], ingredients: [ingredient] });
    const service = buildService({ resolver, manager });

    const breakdown = await service.computeRecipeCost(orgId, recipe.id);
    // 1000 g × 0.01 × 0.8 × 0.9 = 7.2
    expect(breakdown.totalCost).toBe(7.2);
    expect(breakdown.components[0].yield).toBe(0.8);
    expect(breakdown.components[0].wasteFactor).toBeCloseTo(0.1, 4);
  });

  it('walks sub-recipe trees and propagates costs upward', async () => {
    const ingredient = makeIngredient();
    const subRecipe = makeRecipe('Sub', 0);
    const subLine = makeLine(subRecipe.id, { ingredientId: ingredient.id, quantity: 1, unitId: 'kg' });

    const parentRecipe = makeRecipe('Parent', 0);
    const parentLine = makeLine(parentRecipe.id, { subRecipeId: subRecipe.id, quantity: 2, unitId: 'pcs' });

    const resolver: InventoryCostResolver = {
      resolveBaseCost: jest.fn(async () => buildResolved('si-1', 0.005)),
    };
    const manager = fakeManager({
      recipes: [parentRecipe, subRecipe],
      lines: [parentLine, subLine],
      ingredients: [ingredient],
    });
    const service = buildService({ resolver, manager });

    const breakdown = await service.computeRecipeCost(orgId, parentRecipe.id);
    // sub: 1000g × 0.005 × 1 × 1 = 5
    // parent: 5 × 2 × 1 × 1 = 10
    expect(breakdown.totalCost).toBe(10);
    expect(breakdown.components[0].componentKind).toBe('sub-recipe');
    expect(breakdown.components[0].lineCost).toBe(10);
  });

  it('marks a line unresolved when the resolver throws NoCostSourceError', async () => {
    const ingredient = makeIngredient();
    const recipe = makeRecipe('Salsa', 0);
    const line = makeLine(recipe.id, { ingredientId: ingredient.id, quantity: 1, unitId: 'kg' });

    const { NoCostSourceError } = await import('../inventory-cost-resolver');
    const resolver: InventoryCostResolver = {
      resolveBaseCost: jest.fn(async () => {
        throw new NoCostSourceError(ingredient.id);
      }),
    };
    const manager = fakeManager({ recipes: [recipe], lines: [line], ingredients: [ingredient] });
    const service = buildService({ resolver, manager });

    const breakdown = await service.computeRecipeCost(orgId, recipe.id);
    expect(breakdown.totalCost).toBe(0);
    expect(breakdown.components[0].unresolved).toBe(true);
    expect(breakdown.components[0].lineCost).toBe(0);
  });

  it('passes sourceOverrideRef through to the resolver', async () => {
    const ingredient = makeIngredient();
    const recipe = makeRecipe('Salsa', 0);
    const line = makeLine(recipe.id, {
      ingredientId: ingredient.id,
      quantity: 1,
      unitId: 'kg',
      sourceOverrideRef: 'si-override',
    });

    const resolver: InventoryCostResolver = {
      resolveBaseCost: jest.fn(async () => buildResolved('si-override', 0.012)),
    };
    const manager = fakeManager({ recipes: [recipe], lines: [line], ingredients: [ingredient] });
    const service = buildService({ resolver, manager });

    await service.computeRecipeCost(orgId, recipe.id);
    expect(resolver.resolveBaseCost).toHaveBeenCalledWith(
      ingredient.id,
      expect.objectContaining({ sourceOverrideRef: 'si-override' }),
    );
  });

  it('throws CostRecipeNotFoundError when the recipe does not exist', async () => {
    const manager = fakeManager({ recipes: [], lines: [], ingredients: [] });
    const resolver: InventoryCostResolver = { resolveBaseCost: jest.fn() };
    const service = buildService({ resolver, manager });
    await expect(
      service.computeRecipeCost(orgId, '33333333-3333-4333-8333-333333333333'),
    ).rejects.toBeInstanceOf(CostRecipeNotFoundError);
  });

  it('rounds to 4 decimals (banker-friendly)', async () => {
    const ingredient = makeIngredient();
    const recipe = makeRecipe('Salsa', 0);
    const line = makeLine(recipe.id, { ingredientId: ingredient.id, quantity: 0.333, unitId: 'kg' });

    const resolver: InventoryCostResolver = {
      resolveBaseCost: jest.fn(async () => buildResolved('si-1', 0.00333)),
    };
    const manager = fakeManager({ recipes: [recipe], lines: [line], ingredients: [ingredient] });
    const service = buildService({ resolver, manager });

    const breakdown = await service.computeRecipeCost(orgId, recipe.id);
    // 333 × 0.00333 = 1.10889 → rounds to 1.1089
    expect(breakdown.totalCost).toBe(1.1089);
  });
});
