import { Readable } from 'node:stream';
import { Category } from '../domain/category.entity';
import { CsvImportFormatError, IngredientImportService } from './ingredient-import.service';

const orgId = '11111111-1111-4111-8111-111111111111';

const CATEGORY_VEGETABLES_ID = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';

function mkCategory(name: string, parentId: string | null = null, id?: string): Category {
  const c = Object.create(Category.prototype) as Category;
  Object.assign(c, {
    id: id ?? CATEGORY_VEGETABLES_ID,
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

const VEG = mkCategory('vegetables');

interface MockSavedHistory {
  saves: unknown[][];
}

function makeMockDataSource(history: MockSavedHistory, simulateRollbackOnChunkIndex?: number) {
  let chunkCounter = 0;
  return {
    getRepository: () => ({
      findBy: jest.fn(async () => [VEG]),
      save: jest.fn(async (rows: unknown[]) => {
        chunkCounter += 1;
        if (simulateRollbackOnChunkIndex !== undefined && chunkCounter === simulateRollbackOnChunkIndex) {
          throw new Error('CHECK constraint violated (simulated)');
        }
        history.saves.push(rows);
        return rows;
      }),
    }),
    transaction: async (cb: (em: unknown) => Promise<unknown>) => {
      const em = {
        getRepository: () => ({
          save: jest.fn(async (rows: unknown[]) => {
            chunkCounter += 1;
            if (simulateRollbackOnChunkIndex !== undefined && chunkCounter === simulateRollbackOnChunkIndex) {
              throw new Error('CHECK constraint violated (simulated)');
            }
            history.saves.push(rows);
            return rows;
          }),
        }),
      };
      return cb(em);
    },
  };
}

function csvStream(headerRow: string, dataRows: string[]): Readable {
  return Readable.from([headerRow + '\n' + dataRows.join('\n') + '\n']);
}

const HEADER = 'name,categoryName,baseUnitType';

function buildService(history: MockSavedHistory, simulateRollback?: number): IngredientImportService {
  const ds = makeMockDataSource(history, simulateRollback);
  // The service injects DataSource via @InjectDataSource — bypass DI in unit tests.
  return new IngredientImportService(ds as unknown as ConstructorParameters<typeof IngredientImportService>[0]);
}

describe('IngredientImportService', () => {
  describe('header validation', () => {
    it('throws CsvImportFormatError when a required column is missing', async () => {
      const history: MockSavedHistory = { saves: [] };
      const service = buildService(history);
      const stream = csvStream('name,baseUnitType', ['Tomate,WEIGHT']);
      await expect(
        service.parseAndCommit(stream, { organizationId: orgId, dryRun: true }),
      ).rejects.toBeInstanceOf(CsvImportFormatError);
    });

    it('throws on empty CSV', async () => {
      const history: MockSavedHistory = { saves: [] };
      const service = buildService(history);
      const stream = Readable.from(['']);
      await expect(
        service.parseAndCommit(stream, { organizationId: orgId, dryRun: true }),
      ).rejects.toBeInstanceOf(CsvImportFormatError);
    });
  });

  describe('dry-run', () => {
    it('returns valid count without writing any rows', async () => {
      const history: MockSavedHistory = { saves: [] };
      const service = buildService(history);
      const rows = ['Tomate,vegetables,WEIGHT', 'Lechuga,vegetables,WEIGHT'];
      const result = await service.parseAndCommit(csvStream(HEADER, rows), {
        organizationId: orgId,
        dryRun: true,
      });
      expect(result).toEqual({ valid: 2, invalid: 0, errors: [] });
      expect(history.saves).toHaveLength(0);
    });

    it('reports row errors without writing valid rows either', async () => {
      const history: MockSavedHistory = { saves: [] };
      const service = buildService(history);
      const rows = [
        'Tomate,vegetables,WEIGHT',
        ',vegetables,WEIGHT',          // empty name
        'Lechuga,nonexistent,WEIGHT',  // bad category
        'Manzana,vegetables,XXX',      // bad baseUnitType
      ];
      const result = await service.parseAndCommit(csvStream(HEADER, rows), {
        organizationId: orgId,
        dryRun: true,
      });
      expect(result.valid).toBe(1);
      expect(result.invalid).toBe(3);
      expect(result.errors).toHaveLength(3);
      const codes = result.errors.map((e) => e.code).sort();
      expect(codes).toEqual(['CATEGORY_NOT_FOUND', 'INGREDIENT_INVALID_BASE_UNIT_TYPE', 'INGREDIENT_NAME_REQUIRED']);
      expect(history.saves).toHaveLength(0);
    });
  });

  describe('commit', () => {
    it('persists valid rows in the configured chunk size', async () => {
      const history: MockSavedHistory = { saves: [] };
      const service = buildService(history);
      const rows = Array.from({ length: 10 }, (_, i) => `Item${i},vegetables,WEIGHT`);
      const result = await service.parseAndCommit(csvStream(HEADER, rows), {
        organizationId: orgId,
        dryRun: false,
        chunkSize: 4,
      });
      expect(result).toEqual({ valid: 10, invalid: 0, errors: [] });
      // 10 rows, chunkSize=4 → chunks of 4, 4, 2 = 3 transactions
      expect(history.saves).toHaveLength(3);
      expect(history.saves[0]).toHaveLength(4);
      expect(history.saves[1]).toHaveLength(4);
      expect(history.saves[2]).toHaveLength(2);
    });

    it('chunked transaction semantics: poisoned chunk rolls back atomically; prior chunks survive', async () => {
      const history: MockSavedHistory = { saves: [] };
      const service = buildService(history, /* simulateRollbackOnChunkIndex */ 2);
      const rows = Array.from({ length: 9 }, (_, i) => `Item${i},vegetables,WEIGHT`);
      const result = await service.parseAndCommit(csvStream(HEADER, rows), {
        organizationId: orgId,
        dryRun: false,
        chunkSize: 4,
      });
      // chunk 1 (rows 1-4) commits → valid 4
      // chunk 2 (rows 5-8) rolls back → invalid 4 with code CSV_IMPORT_CHUNK_ROLLED_BACK
      // chunk 3 (row 9) commits → valid 1
      expect(result.valid).toBe(5);
      expect(result.invalid).toBe(4);
      expect(result.errors).toHaveLength(4);
      expect(result.errors.every((e) => e.code === 'CSV_IMPORT_CHUNK_ROLLED_BACK')).toBe(true);
      expect(history.saves).toHaveLength(2); // chunk 1 + chunk 3 only
      expect(history.saves[0]).toHaveLength(4);
      expect(history.saves[1]).toHaveLength(1);
    });

    it('skips chunk save when all rows are invalid', async () => {
      const history: MockSavedHistory = { saves: [] };
      const service = buildService(history);
      const rows = Array.from({ length: 5 }, (_, i) => `Item${i},nonexistent,WEIGHT`);
      const result = await service.parseAndCommit(csvStream(HEADER, rows), {
        organizationId: orgId,
        dryRun: false,
      });
      expect(result.valid).toBe(0);
      expect(result.invalid).toBe(5);
      expect(history.saves).toHaveLength(0);
    });
  });
});
