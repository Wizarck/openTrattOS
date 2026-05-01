import { PassThrough } from 'node:stream';
import { Category } from '../domain/category.entity';
import { Ingredient } from '../domain/ingredient.entity';
import { CategoryRepository } from '../infrastructure/category.repository';
import { IngredientRepository } from '../infrastructure/ingredient.repository';
import { IngredientExportService } from './ingredient-export.service';

const orgId = '11111111-1111-4111-8111-111111111111';
const rootId = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const childId = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';

function mkCat(id: string, name: string, parentId: string | null): Category {
  const c = Object.create(Category.prototype) as Category;
  Object.assign(c, {
    id,
    organizationId: orgId,
    parentId,
    name,
    nameEs: name,
    nameEn: name,
    sortOrder: 0,
    isDefault: true,
    createdBy: null,
    updatedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return c;
}

const ROOT = mkCat(rootId, 'fresh', null);
const VEG = mkCat(childId, 'vegetables', rootId);
const CATS = [ROOT, VEG];

function mkIngredient(name: string, categoryId: string, overrides: Partial<Ingredient> = {}): Ingredient {
  const i = Ingredient.create({
    organizationId: orgId,
    categoryId,
    name,
    baseUnitType: 'WEIGHT',
  });
  return Object.assign(i, overrides);
}

interface MockRepos {
  ingredients: IngredientRepository;
  categories: CategoryRepository;
}

function buildService(items: Ingredient[][], pages: (string | null)[], cats: readonly Category[] = CATS): IngredientExportService {
  let pageIndex = 0;
  const ingredientRepo = {
    pageByOrganization: jest.fn(async () => {
      const result = { items: items[pageIndex] ?? [], nextCursor: pages[pageIndex] ?? null };
      pageIndex += 1;
      return result;
    }),
  } as unknown as IngredientRepository;
  const categoryRepo = {
    findBy: jest.fn(async () => cats),
  } as unknown as CategoryRepository;
  const mocks: MockRepos = { ingredients: ingredientRepo, categories: categoryRepo };
  return new IngredientExportService(mocks.ingredients, mocks.categories);
}

async function collectBody(svc: IngredientExportService, organizationId: string): Promise<{ body: string; rowsExported: number }> {
  const dest = new PassThrough();
  const chunks: Buffer[] = [];
  dest.on('data', (c: Buffer) => chunks.push(Buffer.from(c)));
  const ended = new Promise<void>((resolve) => dest.on('end', resolve));
  const { rowsExported } = await svc.exportToStream(dest, { organizationId });
  await ended;
  return { body: Buffer.concat(chunks).toString('utf8'), rowsExported };
}

describe('IngredientExportService', () => {
  it('exports a small org as a single page (header + N rows)', async () => {
    const a = mkIngredient('Tomate', VEG.id);
    a.internalCode = 'TOM-001';
    const b = mkIngredient('Lechuga', VEG.id);
    b.internalCode = 'LEC-001';
    const svc = buildService([[a, b]], [null]);
    const { body, rowsExported } = await collectBody(svc, orgId);
    expect(rowsExported).toBe(2);
    const lines = body.trim().split('\n');
    expect(lines[0]).toBe('name,categoryName,baseUnitType,internalCode,densityFactor,notes');
    expect(lines).toContainEqual(expect.stringContaining('Tomate,fresh/vegetables,WEIGHT,TOM-001,,'));
    expect(lines).toContainEqual(expect.stringContaining('Lechuga,fresh/vegetables,WEIGHT,LEC-001,,'));
  });

  it('paginates across cursor pages', async () => {
    const page1 = [mkIngredient('A', VEG.id), mkIngredient('B', VEG.id)];
    const page2 = [mkIngredient('C', VEG.id)];
    const svc = buildService([page1, page2], ['cursor1', null]);
    const { body, rowsExported } = await collectBody(svc, orgId);
    expect(rowsExported).toBe(3);
    const lines = body.trim().split('\n');
    expect(lines.length).toBe(4); // header + 3 rows
  });

  it('emits the slug-path for nested categories', async () => {
    const subVeg = mkCat('cccccccc-3333-4333-8333-cccccccccccc', 'leafy-greens', VEG.id);
    const cats = [ROOT, VEG, subVeg];
    const a = mkIngredient('Espinacas', subVeg.id);
    const svc = buildService([[a]], [null], cats);
    const { body } = await collectBody(svc, orgId);
    expect(body).toContain('fresh/vegetables/leafy-greens');
  });

  it('round-trip safe: serialised densityFactor is empty string when null', async () => {
    const a = mkIngredient('Sal', VEG.id);
    a.densityFactor = null;
    const svc = buildService([[a]], [null]);
    const { body } = await collectBody(svc, orgId);
    // densityFactor column position is 5th (index 4 zero-based) → must be empty between commas
    expect(body).toMatch(/,WEIGHT,[^,]*,,/);
  });

  it('handles an org with zero rows: header only', async () => {
    const svc = buildService([[]], [null]);
    const { body, rowsExported } = await collectBody(svc, orgId);
    expect(rowsExported).toBe(0);
    expect(body.trim()).toBe('name,categoryName,baseUnitType,internalCode,densityFactor,notes');
  });
});
