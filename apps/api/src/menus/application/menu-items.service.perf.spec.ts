import { CostBreakdown, CostService } from '../../cost/application/cost.service';
import { Recipe } from '../../recipes/domain/recipe.entity';
import { RecipeRepository } from '../../recipes/infrastructure/recipe.repository';
import { MenuItem } from '../domain/menu-item.entity';
import { MenuItemRepository } from '../infrastructure/menu-item.repository';
import { MenuItemsService } from './menu-items.service';

const orgId = '11111111-1111-4111-8111-111111111111';
const recipeId = '22222222-2222-4222-8222-222222222222';
const locationId = '33333333-3333-4333-8333-333333333333';

function makeMenuItem(): MenuItem {
  return MenuItem.create({
    organizationId: orgId,
    recipeId,
    locationId,
    channel: 'DINE_IN',
    sellingPrice: 10,
    targetMargin: 0.6,
  });
}

function makeRecipe(): Recipe {
  const r = Recipe.create({
    organizationId: orgId,
    name: 'Bolognesa',
    description: '',
    wasteFactor: 0,
  });
  r.id = recipeId;
  return r;
}

function makeBreakdown(): CostBreakdown {
  return {
    recipeId,
    recipeName: 'Bolognesa',
    totalCost: 3,
    currency: 'EUR',
    components: [],
    roundingDelta: 0,
  };
}

describe('MenuItemsService.getMargin performance', () => {
  it('responds <200ms p95 across 50 samples (in-process; DB latency not modelled)', async () => {
    const m = makeMenuItem();
    const recipe = makeRecipe();
    const breakdown = makeBreakdown();
    const menuItemRepo = {
      findOneBy: jest.fn(async () => m),
    } as unknown as MenuItemRepository;
    const recipeRepo = {
      findOneBy: jest.fn(async () => recipe),
    } as unknown as RecipeRepository;
    const cost = {
      computeRecipeCost: jest.fn(async () => breakdown),
    } as unknown as CostService;
    const ds = { transaction: async <T>(fn: (em: unknown) => Promise<T>) => fn({}) } as unknown as ConstructorParameters<
      typeof MenuItemsService
    >[0];
    const service = new MenuItemsService(ds, menuItemRepo, recipeRepo, cost);

    // Warm-up.
    await service.getMargin(orgId, m.id);

    const samples: number[] = [];
    for (let i = 0; i < 50; i++) {
      const t0 = process.hrtime.bigint();
      await service.getMargin(orgId, m.id);
      const t1 = process.hrtime.bigint();
      samples.push(Number(t1 - t0) / 1_000_000);
    }
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.floor(samples.length * 0.95)];
    expect(p95).toBeLessThan(200);
  });
});
