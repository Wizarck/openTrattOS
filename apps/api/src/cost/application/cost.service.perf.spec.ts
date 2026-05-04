import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { Ingredient } from '../../ingredients/domain/ingredient.entity';
import { Recipe } from '../../recipes/domain/recipe.entity';
import { RecipeIngredient } from '../../recipes/domain/recipe-ingredient.entity';
import { CostService } from './cost.service';
import { InventoryCostResolver, ResolvedCost } from '../inventory-cost-resolver';
import { RecipeCostHistoryRepository } from '../infrastructure/recipe-cost-history.repository';

const orgId = '11111111-1111-4111-8111-111111111111';
const categoryId = '22222222-2222-4222-8222-222222222222';

interface Stores {
  recipes: Recipe[];
  lines: RecipeIngredient[];
  ingredients: Ingredient[];
}

function fakeManager(stores: Stores) {
  const make = (entity: unknown) => {
    if (entity === Recipe) {
      return {
        findOneBy: jest.fn(async (where: Partial<Recipe>) =>
          stores.recipes.find((r) => r.id === where.id) ?? null,
        ),
        findBy: jest.fn(async (where: { id?: { _value?: string[] } }) => {
          if (where.id && Array.isArray((where.id as unknown as { _value?: unknown[] })._value)) {
            const ids = (where.id as unknown as { _value: string[] })._value;
            return stores.recipes.filter((r) => ids.includes(r.id));
          }
          return stores.recipes;
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
  return { getRepository: jest.fn((entity: unknown) => make(entity)) };
}

function buildBigTree(): { stores: Stores; rootRecipe: Recipe } {
  // 100 nodes: 1 root + 99 ingredient lines on the root.
  const ingredients: Ingredient[] = [];
  const lines: RecipeIngredient[] = [];
  const root = Recipe.create({
    organizationId: orgId,
    name: 'BigRecipe',
    description: '',
    wasteFactor: 0,
  });
  for (let i = 0; i < 100; i++) {
    const ing = Ingredient.create({
      organizationId: orgId,
      categoryId,
      name: `Ing-${i}`,
      baseUnitType: 'WEIGHT',
    });
    ingredients.push(ing);
    lines.push(
      RecipeIngredient.create({
        recipeId: root.id,
        ingredientId: ing.id,
        subRecipeId: null,
        quantity: 0.1,
        unitId: 'kg',
      }),
    );
  }
  return { stores: { recipes: [root], lines, ingredients }, rootRecipe: root };
}

describe('CostService.computeRecipeCost performance', () => {
  it('rolls up a 100-node recipe under 200 ms p95', async () => {
    const { stores, rootRecipe } = buildBigTree();
    const resolver: InventoryCostResolver = {
      resolveBaseCost: jest.fn(
        async (): Promise<ResolvedCost> => ({
          costPerBaseUnit: 0.005,
          currency: 'EUR',
          source: { kind: 'supplier-item', refId: 'si', displayLabel: 'mock' },
        }),
      ),
    };
    const manager = fakeManager(stores);
    const ds = {
      manager,
      getRepository: (e: unknown) => manager.getRepository(e),
      transaction: async <T>(fn: (em: typeof manager) => Promise<T>) => fn(manager),
    } as unknown as DataSource;
    const history = {
      findInWindow: jest.fn(async () => []),
      findLatestForRecipe: jest.fn(async () => []),
    } as unknown as RecipeCostHistoryRepository;
    const events = new EventEmitter2();
    const service = new CostService(ds, resolver, history, events);

    // Warm-up.
    await service.computeRecipeCost(orgId, rootRecipe.id);

    const samples: number[] = [];
    for (let i = 0; i < 20; i++) {
      const t0 = process.hrtime.bigint();
      await service.computeRecipeCost(orgId, rootRecipe.id);
      const t1 = process.hrtime.bigint();
      samples.push(Number(t1 - t0) / 1_000_000);
    }
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.floor(samples.length * 0.95)];
    expect(p95).toBeLessThan(200);
  });
});
