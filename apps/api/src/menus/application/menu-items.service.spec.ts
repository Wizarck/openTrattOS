import { CostBreakdown, CostRecipeNotFoundError, CostService } from '../../cost/application/cost.service';
import { Recipe } from '../../recipes/domain/recipe.entity';
import { RecipeRepository } from '../../recipes/infrastructure/recipe.repository';
import { MenuItem, MenuItemChannel } from '../domain/menu-item.entity';
import { MenuItemRepository } from '../infrastructure/menu-item.repository';
import {
  MenuItemDuplicateError,
  MenuItemLocationNotFoundError,
  MenuItemNotFoundError,
  MenuItemRecipeNotFoundError,
  MenuItemsService,
} from './menu-items.service';

const orgId = '11111111-1111-4111-8111-111111111111';
const recipeId = '22222222-2222-4222-8222-222222222222';
const locationId = '33333333-3333-4333-8333-333333333333';

function makeRecipe(active = true): Recipe {
  const r = Recipe.create({
    organizationId: orgId,
    name: 'Bolognesa',
    description: '',
    wasteFactor: 0,
  });
  r.id = recipeId;
  r.isActive = active;
  return r;
}

function makeMenuItem(channel: MenuItemChannel = 'DINE_IN'): MenuItem {
  return MenuItem.create({
    organizationId: orgId,
    recipeId,
    locationId,
    channel,
    sellingPrice: 10,
    targetMargin: 0.6,
  });
}

function buildBreakdown(total: number, anyUnresolved = false): CostBreakdown {
  return {
    recipeId,
    recipeName: 'Bolognesa',
    totalCost: total,
    currency: 'EUR',
    components: anyUnresolved
      ? [
          {
            recipeIngredientId: 'r1',
            componentKind: 'ingredient',
            componentId: 'i1',
            componentName: 'Tomate',
            quantity: 1,
            unitId: 'kg',
            costPerBaseUnit: 0,
            yield: 1,
            wasteFactor: 0,
            lineCost: 0,
            sourceRefId: null,
            sourceLabel: null,
            unresolved: true,
          },
        ]
      : [],
    roundingDelta: 0,
  };
}

interface Mocks {
  menuItemRepo: jest.Mocked<Pick<MenuItemRepository, 'findOneBy' | 'findBy'>>;
  recipeRepo: jest.Mocked<Pick<RecipeRepository, 'findOneBy'>>;
  cost: jest.Mocked<Pick<CostService, 'computeRecipeCost'>>;
  txEm: { getRepository: jest.Mock };
}

function buildService(): { service: MenuItemsService; mocks: Mocks; saved: MenuItem[] } {
  const saved: MenuItem[] = [];
  const txEmStore: MenuItem[] = [];
  const txEm = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === Recipe) {
        return { findOneBy: jest.fn(async () => makeRecipe(true)) };
      }
      if (entity === MenuItem) {
        return {
          findOneBy: jest.fn(async (where: Partial<MenuItem>) =>
            txEmStore.find((m) => m.id === where.id) ?? null,
          ),
          save: jest.fn(async (m: MenuItem) => {
            saved.push(m);
            txEmStore.push(m);
            return m;
          }),
        };
      }
      // Location
      return { findOneBy: jest.fn(async () => ({ id: locationId, organizationId: orgId })) };
    }),
  };
  const ds = {
    transaction: async <T>(fn: (em: typeof txEm) => Promise<T>) => fn(txEm),
  };
  const menuItemRepo = {
    findOneBy: jest.fn(),
    findBy: jest.fn(async () => []),
  } as unknown as jest.Mocked<Pick<MenuItemRepository, 'findOneBy' | 'findBy'>>;
  const recipeRepo = {
    findOneBy: jest.fn(async () => makeRecipe(true)),
  } as unknown as jest.Mocked<Pick<RecipeRepository, 'findOneBy'>>;
  const cost = { computeRecipeCost: jest.fn() } as unknown as jest.Mocked<Pick<CostService, 'computeRecipeCost'>>;

  const service = new MenuItemsService(
    ds as unknown as ConstructorParameters<typeof MenuItemsService>[0],
    menuItemRepo as unknown as MenuItemRepository,
    recipeRepo as unknown as RecipeRepository,
    cost as unknown as CostService,
  );
  return { service, mocks: { menuItemRepo, recipeRepo, cost, txEm }, saved };
}

describe('MenuItemsService.classify', () => {
  it('returns on_target when at or above target', () => {
    expect(MenuItemsService.classify(0)).toBe('on_target');
    expect(MenuItemsService.classify(0.1)).toBe('on_target');
  });

  it('returns below_target within 5pp below target', () => {
    expect(MenuItemsService.classify(-0.01)).toBe('below_target');
    expect(MenuItemsService.classify(-0.05)).toBe('below_target');
  });

  it('returns at_risk more than 5pp below target', () => {
    expect(MenuItemsService.classify(-0.0501)).toBe('at_risk');
    expect(MenuItemsService.classify(-0.5)).toBe('at_risk');
  });

  it('returns unknown when marginVsTargetPp is null', () => {
    expect(MenuItemsService.classify(null)).toBe('unknown');
  });
});

describe('MenuItemsService CRUD', () => {
  it('creates a MenuItem with valid Recipe + Location refs', async () => {
    const { service, saved } = buildService();
    const view = await service.create({
      organizationId: orgId,
      recipeId,
      locationId,
      channel: 'DINE_IN',
      sellingPrice: 12.5,
      targetMargin: 0.6,
    });
    expect(view.menuItem.recipeId).toBe(recipeId);
    expect(view.displayLabel).toBe('Bolognesa');
    expect(view.recipeDiscontinued).toBe(false);
    expect(saved).toHaveLength(1);
  });

  it('throws MenuItemRecipeNotFoundError when recipe is missing', async () => {
    const { service } = buildService();
    // Override the txEm to return null on Recipe lookup.
    const ds = {
      transaction: async <T>(fn: (em: { getRepository: jest.Mock }) => Promise<T>) =>
        fn({
          getRepository: jest.fn((entity: unknown) => {
            if (entity === Recipe) {
              return { findOneBy: jest.fn(async () => null) };
            }
            return { findOneBy: jest.fn(async () => ({ id: locationId })), save: jest.fn() };
          }),
        }),
    };
    const overridden = new MenuItemsService(
      ds as unknown as ConstructorParameters<typeof MenuItemsService>[0],
      service['menuItems'],
      service['recipes'],
      service['cost'],
    );
    await expect(
      overridden.create({
        organizationId: orgId,
        recipeId,
        locationId,
        channel: 'DINE_IN',
        sellingPrice: 12.5,
        targetMargin: 0.6,
      }),
    ).rejects.toBeInstanceOf(MenuItemRecipeNotFoundError);
  });

  it('throws MenuItemLocationNotFoundError when location is missing', async () => {
    const { service } = buildService();
    const ds = {
      transaction: async <T>(fn: (em: { getRepository: jest.Mock }) => Promise<T>) =>
        fn({
          getRepository: jest.fn((entity: unknown) => {
            if (entity === Recipe) {
              return { findOneBy: jest.fn(async () => makeRecipe(true)) };
            }
            if (entity === MenuItem) {
              return { findOneBy: jest.fn(), save: jest.fn() };
            }
            return { findOneBy: jest.fn(async () => null) };
          }),
        }),
    };
    const overridden = new MenuItemsService(
      ds as unknown as ConstructorParameters<typeof MenuItemsService>[0],
      service['menuItems'],
      service['recipes'],
      service['cost'],
    );
    await expect(
      overridden.create({
        organizationId: orgId,
        recipeId,
        locationId,
        channel: 'DINE_IN',
        sellingPrice: 12.5,
        targetMargin: 0.6,
      }),
    ).rejects.toBeInstanceOf(MenuItemLocationNotFoundError);
  });

  it('throws MenuItemDuplicateError on composite-uniqueness violation', async () => {
    const { service } = buildService();
    const ds = {
      transaction: async <T>(fn: (em: { getRepository: jest.Mock }) => Promise<T>) =>
        fn({
          getRepository: jest.fn((entity: unknown) => {
            if (entity === Recipe) return { findOneBy: jest.fn(async () => makeRecipe(true)) };
            if (entity === MenuItem) {
              return {
                findOneBy: jest.fn(),
                save: jest.fn(async () => {
                  // Mimic Postgres unique violation.
                  const err = Object.assign(new Error('uq_menu_items_active_recipe_location_channel violated'), {
                    name: 'QueryFailedError',
                  });
                  Object.setPrototypeOf(err, (await import('typeorm')).QueryFailedError.prototype);
                  throw err;
                }),
              };
            }
            return { findOneBy: jest.fn(async () => ({ id: locationId })) };
          }),
        }),
    };
    const overridden = new MenuItemsService(
      ds as unknown as ConstructorParameters<typeof MenuItemsService>[0],
      service['menuItems'],
      service['recipes'],
      service['cost'],
    );
    await expect(
      overridden.create({
        organizationId: orgId,
        recipeId,
        locationId,
        channel: 'DINE_IN',
        sellingPrice: 12.5,
        targetMargin: 0.6,
      }),
    ).rejects.toBeInstanceOf(MenuItemDuplicateError);
  });

  it('findOne throws MenuItemNotFoundError when missing', async () => {
    const { service, mocks } = buildService();
    mocks.menuItemRepo.findOneBy.mockResolvedValue(null);
    await expect(service.findOne(orgId, '99999999-9999-4999-8999-999999999999')).rejects.toBeInstanceOf(
      MenuItemNotFoundError,
    );
  });

  it('findOne returns a Discontinued displayLabel when the parent recipe is soft-deleted', async () => {
    const { service, mocks } = buildService();
    const m = makeMenuItem();
    mocks.menuItemRepo.findOneBy.mockResolvedValue(m);
    mocks.recipeRepo.findOneBy.mockResolvedValue(makeRecipe(false));
    const view = await service.findOne(orgId, m.id);
    expect(view.recipeDiscontinued).toBe(true);
    expect(view.displayLabel).toBe('Bolognesa (Discontinued)');
  });

  it('softDelete deactivates the row', async () => {
    const { service, saved } = buildService();
    // Stage a created MenuItem inside the txEm, then soft-delete it.
    const view = await service.create({
      organizationId: orgId,
      recipeId,
      locationId,
      channel: 'DINE_IN',
      sellingPrice: 12.5,
      targetMargin: 0.6,
    });
    await service.softDelete(orgId, view.menuItem.id);
    expect(saved.find((m) => m.id === view.menuItem.id)?.isActive).toBe(false);
  });
});

describe('MenuItemsService.getMargin', () => {
  it('returns on_target when computed margin >= target', async () => {
    const { service, mocks } = buildService();
    const m = MenuItem.create({
      organizationId: orgId,
      recipeId,
      locationId,
      channel: 'DINE_IN',
      sellingPrice: 10,
      targetMargin: 0.6,
    });
    mocks.menuItemRepo.findOneBy.mockResolvedValue(m);
    mocks.cost.computeRecipeCost.mockResolvedValue(buildBreakdown(3));
    const report = await service.getMargin(orgId, m.id);
    expect(report.cost).toBe(3);
    expect(report.marginAbsolute).toBe(7);
    expect(report.marginPercent).toBe(0.7);
    expect(report.marginVsTargetPp).toBe(0.1);
    expect(report.status).toBe('on_target');
    expect(report.statusLabel).toBe('On target');
    expect(report.warnings).toEqual([]);
  });

  it('returns below_target within 5pp below target', async () => {
    const { service, mocks } = buildService();
    const m = MenuItem.create({
      organizationId: orgId,
      recipeId,
      locationId,
      channel: 'DINE_IN',
      sellingPrice: 10,
      targetMargin: 0.6,
    });
    mocks.menuItemRepo.findOneBy.mockResolvedValue(m);
    // cost=4.2 → margin=5.8 → 0.58 → vs target -0.02
    mocks.cost.computeRecipeCost.mockResolvedValue(buildBreakdown(4.2));
    const report = await service.getMargin(orgId, m.id);
    expect(report.status).toBe('below_target');
  });

  it('returns at_risk when more than 5pp below target', async () => {
    const { service, mocks } = buildService();
    const m = MenuItem.create({
      organizationId: orgId,
      recipeId,
      locationId,
      channel: 'DINE_IN',
      sellingPrice: 10,
      targetMargin: 0.6,
    });
    mocks.menuItemRepo.findOneBy.mockResolvedValue(m);
    // cost=5 → margin=5 → 0.5 → vs target -0.1
    mocks.cost.computeRecipeCost.mockResolvedValue(buildBreakdown(5));
    const report = await service.getMargin(orgId, m.id);
    expect(report.status).toBe('at_risk');
  });

  it('returns unknown with a warning when an ingredient is unresolved', async () => {
    const { service, mocks } = buildService();
    const m = makeMenuItem();
    mocks.menuItemRepo.findOneBy.mockResolvedValue(m);
    mocks.cost.computeRecipeCost.mockResolvedValue(buildBreakdown(0, true));
    const report = await service.getMargin(orgId, m.id);
    expect(report.cost).toBeNull();
    expect(report.status).toBe('unknown');
    expect(report.statusLabel).toBe('Cost unknown');
    expect(report.warnings.some((w) => w.startsWith('cost_unresolved'))).toBe(true);
  });

  it('returns unknown without crashing when CostRecipeNotFoundError is thrown', async () => {
    const { service, mocks } = buildService();
    const m = makeMenuItem();
    mocks.menuItemRepo.findOneBy.mockResolvedValue(m);
    mocks.cost.computeRecipeCost.mockRejectedValue(new CostRecipeNotFoundError(recipeId));
    const report = await service.getMargin(orgId, m.id);
    expect(report.status).toBe('unknown');
    expect(report.cost).toBeNull();
    expect(report.warnings.some((w) => w.startsWith('cost_recipe_not_found'))).toBe(true);
  });

  it('returns unknown for any unexpected upstream error (never 5xx)', async () => {
    const { service, mocks } = buildService();
    const m = makeMenuItem();
    mocks.menuItemRepo.findOneBy.mockResolvedValue(m);
    mocks.cost.computeRecipeCost.mockRejectedValue(new Error('boom'));
    const report = await service.getMargin(orgId, m.id);
    expect(report.status).toBe('unknown');
    expect(report.warnings.some((w) => w.startsWith('cost_error'))).toBe(true);
  });

  it('throws MenuItemNotFoundError when MenuItem is missing', async () => {
    const { service, mocks } = buildService();
    mocks.menuItemRepo.findOneBy.mockResolvedValue(null);
    await expect(service.getMargin(orgId, '99999999-9999-4999-8999-999999999999')).rejects.toBeInstanceOf(
      MenuItemNotFoundError,
    );
  });

  it('flags recipeDiscontinued in the margin report when parent recipe is soft-deleted', async () => {
    const { service, mocks } = buildService();
    const m = makeMenuItem();
    mocks.menuItemRepo.findOneBy.mockResolvedValue(m);
    mocks.recipeRepo.findOneBy.mockResolvedValue(makeRecipe(false));
    mocks.cost.computeRecipeCost.mockResolvedValue(buildBreakdown(3));
    const report = await service.getMargin(orgId, m.id);
    expect(report.recipeDiscontinued).toBe(true);
  });
});
