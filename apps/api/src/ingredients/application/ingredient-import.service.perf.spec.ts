import { Readable } from 'node:stream';
import { Category } from '../domain/category.entity';
import { IngredientImportService } from './ingredient-import.service';

const orgId = '11111111-1111-4111-8111-111111111111';
const CATEGORY_VEGETABLES_ID = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';

function mkCategory(name: string): Category {
  const c = Object.create(Category.prototype) as Category;
  Object.assign(c, {
    id: CATEGORY_VEGETABLES_ID,
    organizationId: orgId,
    parentId: null,
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

const VEG = mkCategory('vegetables');

function makeDataSource(saves: unknown[][]) {
  return {
    getRepository: () => ({ findBy: jest.fn(async () => [VEG]) }),
    transaction: async (cb: (em: unknown) => Promise<unknown>) => {
      const em = {
        getRepository: () => ({
          save: jest.fn(async (rows: unknown[]) => {
            saves.push(rows);
            return rows;
          }),
        }),
      };
      return cb(em);
    },
  };
}

function build1000RowCsv(): string {
  const lines = ['name,categoryName,baseUnitType'];
  for (let i = 0; i < 1000; i++) {
    lines.push(`Item${i},vegetables,WEIGHT`);
  }
  return lines.join('\n') + '\n';
}

describe('IngredientImportService — 1000-row throughput', () => {
  it('imports 1000 rows in <2 s with chunkSize=500 (mock-DB)', async () => {
    const saves: unknown[][] = [];
    const ds = makeDataSource(saves);
    const service = new IngredientImportService(
      ds as unknown as ConstructorParameters<typeof IngredientImportService>[0],
    );
    const csv = build1000RowCsv();

    const t0 = process.hrtime.bigint();
    const result = await service.parseAndCommit(Readable.from([csv]), {
      organizationId: orgId,
      dryRun: false,
      chunkSize: 500,
    });
    const t1 = process.hrtime.bigint();
    const elapsedMs = Number(t1 - t0) / 1_000_000;

    expect(result.valid).toBe(1000);
    expect(result.invalid).toBe(0);
    expect(saves).toHaveLength(2);
    expect(saves[0]).toHaveLength(500);
    expect(saves[1]).toHaveLength(500);
    expect(elapsedMs).toBeLessThan(2000);
  });
});
