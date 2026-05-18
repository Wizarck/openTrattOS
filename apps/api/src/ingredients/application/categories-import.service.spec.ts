import { Category } from '../domain/category.entity';
import {
  CategoriesImportFormatError,
  CategoriesImportService,
  CSV_MAX_BYTES,
  CSV_MAX_ROWS,
} from './categories-import.service';

const ORG_ID = '11111111-1111-4111-8111-111111111111';

function mkCategory(name: string, parentId: string | null = null, id?: string): Category {
  const c = Object.create(Category.prototype) as Category;
  Object.assign(c, {
    id: id ?? `aaaaaaaa-1111-4111-8111-${name.padStart(12, '0').slice(-12)}`,
    organizationId: ORG_ID,
    parentId,
    name,
    nameEs: name,
    nameEn: name,
    sortOrder: 0,
    isDefault: false,
    createdBy: null,
    updatedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return c;
}

interface SaveHistory {
  saved: Category[];
}

function makeDeps(seeded: Category[], history: SaveHistory) {
  const repoForService = {
    findBy: jest.fn(async () => seeded),
  };
  // The transaction's entity-manager repo returns the live cohort and saves into history.
  const txRepoState: Category[] = [...seeded];
  const dataSource = {
    transaction: async (cb: (em: unknown) => Promise<unknown>) => {
      const em = {
        getRepository: () => ({
          findBy: jest.fn(async () => txRepoState),
          save: jest.fn(async (entity: Category) => {
            history.saved.push(entity);
            // Mimic an upsert — replace by id if present, else append.
            const existingIndex = txRepoState.findIndex((c) => c.id === entity.id);
            if (existingIndex >= 0) txRepoState[existingIndex] = entity;
            else txRepoState.push(entity);
            return entity;
          }),
        }),
      };
      return cb(em);
    },
  };
  return {
    repoForService,
    dataSource,
    txRepoState,
  };
}

function buildService(seeded: Category[], history: SaveHistory): CategoriesImportService {
  const { repoForService, dataSource } = makeDeps(seeded, history);
  return new CategoriesImportService(
    dataSource as unknown as ConstructorParameters<typeof CategoriesImportService>[0],
    repoForService as unknown as ConstructorParameters<typeof CategoriesImportService>[1],
  );
}

describe('CategoriesImportService', () => {
  describe('parser + preview', () => {
    it('parses a valid CSV and classifies new + duplicate rows', async () => {
      const seeded = [mkCategory('Verduras', null, 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa')];
      const history: SaveHistory = { saved: [] };
      const service = buildService(seeded, history);

      const csv = [
        'nombre,padre,color',
        'Frutas,,#ff0000',
        'Verduras,,#00ff00',
        'Manzanas,Frutas,#aabbcc',
      ].join('\n');

      const preview = await service.preview(ORG_ID, csv);

      expect(preview.totalRows).toBe(3);
      expect(preview.errors).toEqual([]);
      expect(preview.new).toEqual([
        { name: 'Frutas', color: '#ff0000' },
        { name: 'Manzanas', parentName: 'Frutas', color: '#aabbcc' },
      ]);
      expect(preview.duplicates).toEqual([
        {
          name: 'Verduras',
          color: '#00ff00',
          existingId: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
        },
      ]);
    });

    it('matches duplicates case-insensitively', async () => {
      const seeded = [mkCategory('Carnes', null, 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa')];
      const history: SaveHistory = { saved: [] };
      const service = buildService(seeded, history);
      const csv = 'nombre\ncarnes\nPescados';
      const preview = await service.preview(ORG_ID, csv);
      expect(preview.duplicates.map((d) => d.name)).toEqual(['carnes']);
      expect(preview.new.map((n) => n.name)).toEqual(['Pescados']);
    });

    it('rejects rows whose nombre is missing or out of bounds (2-64 chars)', async () => {
      const history: SaveHistory = { saved: [] };
      const service = buildService([], history);
      // Trailing comma keeps the row non-empty so the parser surfaces an empty nombre cell.
      const csv = [
        'nombre,color',
        ',#000000',       // empty name
        'a,#111111',       // 1 char
        `${'x'.repeat(65)},#222222`, // 65 chars
        'OK,#333333',      // 2 chars
      ].join('\n');
      const preview = await service.preview(ORG_ID, csv);
      expect(preview.errors).toHaveLength(3);
      expect(preview.errors[0].row).toBe(1);
      expect(preview.errors[0].message).toMatch(/required/);
      expect(preview.errors[1].message).toMatch(/2-64 chars/);
      expect(preview.errors[2].message).toMatch(/2-64 chars/);
      expect(preview.new.map((n) => n.name)).toEqual(['OK']);
    });

    it('rejects color values that are not #RRGGBB hex', async () => {
      const history: SaveHistory = { saved: [] };
      const service = buildService([], history);
      const csv = [
        'nombre,color',
        'Aceites,#xyz123',
        'Lacteos,#ABCDEF',
        'Bebidas,red',
      ].join('\n');
      const preview = await service.preview(ORG_ID, csv);
      expect(preview.new.map((n) => n.name)).toEqual(['Lacteos']);
      const errMsgs = preview.errors.map((e) => e.message);
      expect(errMsgs).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/#RRGGBB/),
          expect.stringMatching(/#RRGGBB/),
        ]),
      );
      expect(preview.errors).toHaveLength(2);
    });

    it('errors when padre references an unknown category', async () => {
      const history: SaveHistory = { saved: [] };
      const service = buildService([], history);
      const csv = 'nombre,padre\nManzanas,Frutas';
      const preview = await service.preview(ORG_ID, csv);
      expect(preview.new).toEqual([]);
      expect(preview.errors).toEqual([
        {
          row: 1,
          message: expect.stringContaining('padre "Frutas"'),
        },
      ]);
    });

    it('resolves padre against earlier rows in the same batch', async () => {
      const history: SaveHistory = { saved: [] };
      const service = buildService([], history);
      const csv = [
        'nombre,padre',
        'Frutas,',
        'Manzanas,Frutas',
      ].join('\n');
      const preview = await service.preview(ORG_ID, csv);
      expect(preview.errors).toEqual([]);
      expect(preview.new).toEqual([
        { name: 'Frutas' },
        { name: 'Manzanas', parentName: 'Frutas' },
      ]);
    });

    it('errors when the same nombre is declared twice in the CSV', async () => {
      const history: SaveHistory = { saved: [] };
      const service = buildService([], history);
      const csv = ['nombre', 'Frutas', 'Frutas'].join('\n');
      const preview = await service.preview(ORG_ID, csv);
      expect(preview.new.map((n) => n.name)).toEqual(['Frutas']);
      expect(preview.errors).toHaveLength(1);
      expect(preview.errors[0].message).toMatch(/declared twice/);
    });

    it('rejects CSVs without the required nombre header', async () => {
      const history: SaveHistory = { saved: [] };
      const service = buildService([], history);
      await expect(service.preview(ORG_ID, 'padre,color\nFoo,#abcdef')).rejects.toBeInstanceOf(
        CategoriesImportFormatError,
      );
    });

    it('handles double-quote escapes and embedded commas', async () => {
      const history: SaveHistory = { saved: [] };
      const service = buildService([], history);
      const csv = ['nombre,color', '"Aceites, finos",#000000', '"Pe""sca""dos",#ffffff'].join('\n');
      const preview = await service.preview(ORG_ID, csv);
      expect(preview.errors).toEqual([]);
      expect(preview.new.map((n) => n.name)).toEqual(['Aceites, finos', 'Pe"sca"dos']);
    });

    it('rejects CSV larger than 1 MB', async () => {
      const history: SaveHistory = { saved: [] };
      const service = buildService([], history);
      const tooBig = 'nombre\n' + 'a'.repeat(CSV_MAX_BYTES);
      await expect(service.preview(ORG_ID, tooBig)).rejects.toBeInstanceOf(
        CategoriesImportFormatError,
      );
    });

    it('rejects CSV with more than 5000 data rows', async () => {
      const history: SaveHistory = { saved: [] };
      const service = buildService([], history);
      // Build a long CSV — keep names short to stay under the byte cap.
      const rows = ['nombre'];
      for (let i = 0; i < CSV_MAX_ROWS + 1; i += 1) rows.push(`c${i}`);
      const csv = rows.join('\n');
      await expect(service.preview(ORG_ID, csv)).rejects.toBeInstanceOf(
        CategoriesImportFormatError,
      );
    });

    it('skips empty lines without inflating totalRows', async () => {
      const history: SaveHistory = { saved: [] };
      const service = buildService([], history);
      const csv = ['nombre', '', 'Frutas', '', 'Lacteos', ''].join('\n');
      const preview = await service.preview(ORG_ID, csv);
      expect(preview.new.map((n) => n.name).sort()).toEqual(['Frutas', 'Lacteos']);
      expect(preview.errors).toEqual([]);
    });
  });

  describe('commit', () => {
    it('creates new rows + skips duplicates by default mode', async () => {
      const seeded = [mkCategory('Verduras', null, 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa')];
      const history: SaveHistory = { saved: [] };
      const service = buildService(seeded, history);

      const result = await service.commit(ORG_ID, {
        new: [{ name: 'Frutas' }, { name: 'Manzanas', parentName: 'Frutas' }],
        duplicates: [
          {
            name: 'Verduras',
            existingId: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
          },
        ],
        mode: 'skip-duplicates',
      });

      expect(result).toEqual({ created: 2, updated: 0, skipped: 1 });
      // 2 new categories saved (skipped duplicate = no save)
      const newNames = history.saved.map((c) => c.name).sort();
      expect(newNames).toEqual(['Frutas', 'Manzanas']);
      // Manzanas's parent is Frutas (resolved at commit time)
      const manzanas = history.saved.find((c) => c.name === 'Manzanas');
      const frutas = history.saved.find((c) => c.name === 'Frutas');
      expect(manzanas?.parentId).toBe(frutas?.id);
    });

    it('update-duplicates reparents an existing row when parentName changes', async () => {
      const root = mkCategory('Root', null, 'aaaaaaaa-1111-4111-8111-000000000001');
      const oldParent = mkCategory('OldParent', null, 'aaaaaaaa-1111-4111-8111-000000000002');
      const target = mkCategory('Target', oldParent.id, 'aaaaaaaa-1111-4111-8111-000000000003');
      const seeded = [root, oldParent, target];
      const history: SaveHistory = { saved: [] };
      const service = buildService(seeded, history);

      const result = await service.commit(ORG_ID, {
        new: [],
        duplicates: [
          { name: 'Target', parentName: 'Root', existingId: target.id },
        ],
        mode: 'update-duplicates',
      });

      expect(result).toEqual({ created: 0, updated: 1, skipped: 0 });
      const saved = history.saved.find((c) => c.id === target.id);
      expect(saved?.parentId).toBe(root.id);
    });

    it('rejects an invalid mode value', async () => {
      const history: SaveHistory = { saved: [] };
      const service = buildService([], history);
      await expect(
        service.commit(ORG_ID, {
          new: [],
          duplicates: [],
          mode: 'bogus' as unknown as 'skip-duplicates',
        }),
      ).rejects.toBeInstanceOf(CategoriesImportFormatError);
    });

    it('tolerates a missing existing row (race between preview + commit)', async () => {
      const history: SaveHistory = { saved: [] };
      const service = buildService([], history);
      const result = await service.commit(ORG_ID, {
        new: [],
        duplicates: [
          {
            name: 'Phantom',
            existingId: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
            parentName: 'Whatever',
          },
        ],
        mode: 'update-duplicates',
      });
      expect(result).toEqual({ created: 0, updated: 0, skipped: 1 });
    });
  });
});
