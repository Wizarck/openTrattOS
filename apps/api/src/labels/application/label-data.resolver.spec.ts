import { DataSource, EntityManager } from 'typeorm';
import { LabelDataResolver } from './label-data.resolver';
import {
  LabelOrganizationNotFoundError,
  LabelRecipeNotFoundError,
  MissingMandatoryFieldsError,
  UnsupportedLocaleError,
} from './errors';
import { Ingredient } from '../../ingredients/domain/ingredient.entity';
import { Organization } from '../../iam/domain/organization.entity';
import { Recipe } from '../../recipes/domain/recipe.entity';
import { RecipeIngredient } from '../../recipes/domain/recipe-ingredient.entity';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const RECIPE_ID = '22222222-2222-4222-8222-222222222222';
const I_PASTA = '33333333-3333-4333-8333-333333333331';
const I_TOMATO = '33333333-3333-4333-8333-333333333332';

interface RowSet {
  recipes: Map<string, Recipe>;
  organizations: Map<string, Organization>;
  ingredients: Map<string, Ingredient>;
  lines: Map<string, RecipeIngredient[]>; // keyed by recipeId
}

function makeOrg(overrides: Partial<Organization> = {}): Organization {
  const org = new Organization();
  org.id = ORG_ID;
  org.name = 'Restaurante Tagliatelle';
  org.currencyCode = 'EUR';
  org.defaultLocale = 'es';
  org.timezone = 'Europe/Madrid';
  org.labelFields = {
    businessName: 'Restaurante Tagliatelle',
    contactInfo: { email: 'info@example.com' },
    postalAddress: {
      street: 'Calle Mayor 1',
      city: 'Madrid',
      postalCode: '28001',
      country: 'España',
    },
    pageSize: 'a4',
  };
  return Object.assign(org, overrides);
}

function makeRecipe(): Recipe {
  const r = new Recipe();
  r.id = RECIPE_ID;
  r.organizationId = ORG_ID;
  r.name = 'Tagliatelle bolognesa';
  r.description = '';
  r.wasteFactor = 0 as unknown as number;
  r.portions = 4;
  r.isActive = true;
  return r;
}

function makeIngredient(id: string, name: string, allergens: string[]): Ingredient {
  const ing = new Ingredient();
  ing.id = id;
  ing.organizationId = ORG_ID;
  ing.name = name;
  ing.baseUnitType = 'WEIGHT';
  ing.allergens = allergens;
  ing.dietFlags = [];
  ing.nutrition = {
    kcal: 200,
    fat: 5,
    saturated_fat: 1,
    carbohydrates: 30,
    sugars: 2,
    protein: 7,
    salt: 0.5,
  } as Record<string, unknown>;
  ing.brandName = null;
  ing.externalSourceRef = null;
  ing.overrides = {};
  return ing;
}

function makeLine(
  id: string,
  recipeId: string,
  ingredientId: string,
  quantity: number,
): RecipeIngredient {
  const line = new RecipeIngredient();
  line.id = id;
  line.recipeId = recipeId;
  line.ingredientId = ingredientId;
  line.subRecipeId = null;
  line.quantity = quantity as unknown as number;
  line.unitId = 'g';
  line.yieldPercentOverride = null;
  line.sourceOverrideRef = null;
  return line;
}

function makeFakeDataSource(rows: RowSet): DataSource {
  const repo = (entity: unknown) => {
    if (entity === Recipe) {
      return {
        findOneBy: async (where: { id: string; organizationId?: string }) => {
          const r = rows.recipes.get(where.id);
          if (!r) return null;
          if (where.organizationId && r.organizationId !== where.organizationId) return null;
          return r;
        },
        findBy: async (_where: unknown) => [],
      };
    }
    if (entity === Organization) {
      return {
        findOneBy: async (where: { id: string }) => rows.organizations.get(where.id) ?? null,
      };
    }
    if (entity === Ingredient) {
      return {
        findOneBy: async (where: { id: string }) => rows.ingredients.get(where.id) ?? null,
        findBy: async (where: { id: { _value?: string[] } }) => {
          // TypeORM In(...) is an object — extract values defensively
          const ids: string[] = Array.isArray(where.id)
            ? (where.id as unknown as string[])
            : ((where.id as { _value: string[] })._value ?? []);
          return ids.map((id) => rows.ingredients.get(id)).filter(Boolean) as Ingredient[];
        },
      };
    }
    if (entity === RecipeIngredient) {
      return {
        findBy: async (where: { recipeId: string }) => rows.lines.get(where.recipeId) ?? [],
      };
    }
    throw new Error(`Unexpected entity: ${String(entity)}`);
  };

  const fakeEm = { getRepository: repo } as unknown as EntityManager;
  const ds = {
    manager: fakeEm,
    getRepository: repo,
  };
  return ds as unknown as DataSource;
}

function makeAllergensServiceStub(): { getAllergensRollup: jest.Mock } {
  const stub = {
    getAllergensRollup: jest.fn().mockResolvedValue({
      aggregated: ['gluten', 'eggs'],
      byIngredient: {
        [I_PASTA]: ['gluten', 'eggs'],
        [I_TOMATO]: [],
      },
      override: null,
      crossContamination: { note: null, allergens: [] },
    }),
  };
  return stub;
}

function makeIngredientsServiceStub(): { getMacroRollup: jest.Mock } {
  return {
    getMacroRollup: jest.fn().mockResolvedValue({
      perPortion: {},
      per100g: {
        kcal: 180,
        fat: 6.5,
        saturated_fat: 2.1,
        carbohydrates: 22.0,
        sugars: 4.0,
        protein: 8.5,
        salt: 0.8,
      },
      totalWeightG: 1200,
      externalSources: [],
    }),
  };
}

describe('LabelDataResolver', () => {
  let baseRows: RowSet;

  beforeEach(() => {
    baseRows = {
      recipes: new Map([[RECIPE_ID, makeRecipe()]]),
      organizations: new Map([[ORG_ID, makeOrg()]]),
      ingredients: new Map([
        [I_PASTA, makeIngredient(I_PASTA, 'Tagliatelle', ['gluten', 'eggs'])],
        [I_TOMATO, makeIngredient(I_TOMATO, 'Tomate triturado', [])],
      ]),
      lines: new Map([
        [
          RECIPE_ID,
          [
            makeLine('l1', RECIPE_ID, I_PASTA, 400),
            makeLine('l2', RECIPE_ID, I_TOMATO, 800),
          ],
        ],
      ]),
    };
  });

  function buildResolver(rows: RowSet = baseRows): {
    resolver: LabelDataResolver;
    allergensStub: ReturnType<typeof makeAllergensServiceStub>;
    macrosStub: ReturnType<typeof makeIngredientsServiceStub>;
  } {
    const allergensStub = makeAllergensServiceStub();
    const macrosStub = makeIngredientsServiceStub();
    const resolver = new LabelDataResolver(
      makeFakeDataSource(rows),
      allergensStub as never,
      macrosStub as never,
    );
    return { resolver, allergensStub, macrosStub };
  }

  it('resolves a complete label using org defaultLocale', async () => {
    const { resolver } = buildResolver();
    const data = await resolver.resolve(ORG_ID, RECIPE_ID, undefined);
    expect(data.locale).toBe('es');
    expect(data.recipe.name).toBe('Tagliatelle bolognesa');
    expect(data.recipe.portions).toBe(4);
    expect(data.recipe.allergens).toEqual(['gluten', 'eggs']);
    expect(data.recipe.macros.kcalPer100g).toBe(180);
  });

  it('honours explicit locale override', async () => {
    const { resolver } = buildResolver();
    const data = await resolver.resolve(ORG_ID, RECIPE_ID, 'en');
    expect(data.locale).toBe('en');
  });

  it('throws UnsupportedLocaleError for unknown locale', async () => {
    const { resolver } = buildResolver();
    await expect(resolver.resolve(ORG_ID, RECIPE_ID, 'zz')).rejects.toBeInstanceOf(
      UnsupportedLocaleError,
    );
  });

  it('throws LabelOrganizationNotFoundError when org missing', async () => {
    const { resolver } = buildResolver({
      ...baseRows,
      organizations: new Map(),
    });
    await expect(resolver.resolve(ORG_ID, RECIPE_ID, undefined)).rejects.toBeInstanceOf(
      LabelOrganizationNotFoundError,
    );
  });

  it('throws LabelRecipeNotFoundError when recipe missing', async () => {
    const { resolver } = buildResolver({
      ...baseRows,
      recipes: new Map(),
    });
    await expect(resolver.resolve(ORG_ID, RECIPE_ID, undefined)).rejects.toBeInstanceOf(
      LabelRecipeNotFoundError,
    );
  });

  it('orders ingredients by descending mass per Article 18', async () => {
    const { resolver } = buildResolver();
    const data = await resolver.resolve(ORG_ID, RECIPE_ID, undefined);
    expect(data.recipe.ingredientList.map((r) => r.name)).toEqual([
      'tomate triturado',
      'tagliatelle',
    ]);
  });

  it('totals netNetMass from leaf scaledQuantity × cumulativeYieldWaste', async () => {
    const { resolver } = buildResolver();
    const data = await resolver.resolve(ORG_ID, RECIPE_ID, undefined);
    // 400 + 800 with no yield/waste = 1200
    expect(data.recipe.totalNetMassG).toBe(1200);
  });

  it('refuses on missing org.businessName + lists field', async () => {
    const org = makeOrg();
    org.labelFields = { ...org.labelFields, businessName: '' };
    const { resolver } = buildResolver({
      ...baseRows,
      organizations: new Map([[ORG_ID, org]]),
    });
    await expect(resolver.resolve(ORG_ID, RECIPE_ID, undefined)).rejects.toMatchObject({
      name: 'MissingMandatoryFieldsError',
      missing: expect.arrayContaining(['org.businessName']),
    });
  });

  it('refuses when org.postalAddress incomplete', async () => {
    const org = makeOrg();
    org.labelFields = {
      ...org.labelFields,
      postalAddress: { street: 'Calle 1', city: '', postalCode: '28001', country: 'ES' },
    };
    const { resolver } = buildResolver({
      ...baseRows,
      organizations: new Map([[ORG_ID, org]]),
    });
    await expect(resolver.resolve(ORG_ID, RECIPE_ID, undefined)).rejects.toMatchObject({
      missing: expect.arrayContaining(['org.postalAddress.city']),
    });
  });

  it('refuses on empty ingredient list', async () => {
    const { resolver } = buildResolver({
      ...baseRows,
      lines: new Map([[RECIPE_ID, []]]),
    });
    await expect(resolver.resolve(ORG_ID, RECIPE_ID, undefined)).rejects.toMatchObject({
      missing: expect.arrayContaining(['recipe.ingredientList']),
    });
  });

  it('refuses on missing macros (NaN value)', async () => {
    const allergensStub = makeAllergensServiceStub();
    const macrosStub = {
      getMacroRollup: jest.fn().mockResolvedValue({
        perPortion: {},
        per100g: {
          kcal: 180,
          // fat missing → NaN
          saturated_fat: 2.1,
          carbohydrates: 22.0,
          sugars: 4.0,
          protein: 8.5,
          salt: 0.8,
        },
        totalWeightG: 1200,
        externalSources: [],
      }),
    };
    const resolver = new LabelDataResolver(
      makeFakeDataSource(baseRows),
      allergensStub as never,
      macrosStub as never,
    );
    await expect(resolver.resolve(ORG_ID, RECIPE_ID, undefined)).rejects.toBeInstanceOf(
      MissingMandatoryFieldsError,
    );
  });

  it('falls back to A4 page size when org has none configured', async () => {
    const org = makeOrg();
    org.labelFields = { ...org.labelFields, pageSize: undefined };
    const { resolver } = buildResolver({
      ...baseRows,
      organizations: new Map([[ORG_ID, org]]),
    });
    const data = await resolver.resolve(ORG_ID, RECIPE_ID, undefined);
    expect(data.pageSize).toBe('a4');
  });

  it('honours thermal-4x6 page size when configured', async () => {
    const org = makeOrg();
    org.labelFields = { ...org.labelFields, pageSize: 'thermal-4x6' };
    const { resolver } = buildResolver({
      ...baseRows,
      organizations: new Map([[ORG_ID, org]]),
    });
    const data = await resolver.resolve(ORG_ID, RECIPE_ID, undefined);
    expect(data.pageSize).toBe('thermal-4x6');
  });

  it('includes cross-contamination when both note + tags present', async () => {
    const allergensStub = {
      getAllergensRollup: jest.fn().mockResolvedValue({
        aggregated: ['gluten', 'eggs'],
        byIngredient: {
          [I_PASTA]: ['gluten', 'eggs'],
          [I_TOMATO]: [],
        },
        override: null,
        crossContamination: {
          note: 'Producción compartida con frutos secos',
          allergens: ['nuts'],
        },
      }),
    };
    const macrosStub = makeIngredientsServiceStub();
    const resolver = new LabelDataResolver(
      makeFakeDataSource(baseRows),
      allergensStub as never,
      macrosStub as never,
    );
    const data = await resolver.resolve(ORG_ID, RECIPE_ID, undefined);
    expect(data.recipe.crossContamination).toEqual({
      note: 'Producción compartida con frutos secos',
      allergens: ['nuts'],
    });
  });
});
