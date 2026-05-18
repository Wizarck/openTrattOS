import { BadRequestException } from '@nestjs/common';
import { ROLES_METADATA_KEY } from '../../shared/decorators/roles.decorator';
import {
  CategoriesImportFormatError,
  CategoriesImportService,
  CategoriesPreviewResult,
} from '../application/categories-import.service';
import { CategoryRepository } from '../infrastructure/category.repository';
import { CategoriesController } from './categories.controller';

const ORG_ID = '11111111-1111-4111-8111-111111111111';

interface UploadedCsvFile {
  fieldname: string;
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

function mkUpload(content: string): UploadedCsvFile {
  const buffer = Buffer.from(content, 'utf8');
  return {
    fieldname: 'csv',
    originalname: 'cats.csv',
    mimetype: 'text/csv',
    buffer,
    size: buffer.length,
  };
}

describe('CategoriesController — import endpoints', () => {
  function buildController(
    overrides: Partial<{
      preview: jest.Mock;
      commit: jest.Mock;
    }> = {},
  ) {
    const importService = {
      preview: jest.fn(),
      commit: jest.fn(),
      ...overrides,
    } as unknown as CategoriesImportService;
    const repo = {} as unknown as CategoryRepository;
    const controller = new CategoriesController(repo, importService);
    return { controller, importService };
  }

  describe('POST /categories/import/preview', () => {
    it('happy path: forwards CSV bytes + returns the wrapped preview', async () => {
      const previewResult: CategoriesPreviewResult = {
        totalRows: 1,
        new: [{ name: 'Frutas' }],
        duplicates: [],
        errors: [],
      };
      const { controller, importService } = buildController({
        preview: jest.fn().mockResolvedValue(previewResult),
      });
      const file = mkUpload('nombre\nFrutas\n');
      const wrapped = await controller.importPreview(ORG_ID, file);
      expect(importService.preview).toHaveBeenCalledWith(ORG_ID, 'nombre\nFrutas\n');
      expect(wrapped.data).toEqual(previewResult);
    });

    it('returns 400 when no file is uploaded', async () => {
      const { controller } = buildController();
      await expect(controller.importPreview(ORG_ID, undefined)).rejects.toMatchObject({
        constructor: BadRequestException,
        response: {
          code: 'CATEGORIES_CSV_IMPORT_INVALID_FORMAT',
          detail: expect.stringContaining('no file uploaded'),
        },
      });
    });

    it('translates CategoriesImportFormatError to 400 with detail', async () => {
      const { controller } = buildController({
        preview: jest
          .fn()
          .mockRejectedValue(new CategoriesImportFormatError('missing required column: nombre')),
      });
      const file = mkUpload('padre\nx\n');
      await expect(controller.importPreview(ORG_ID, file)).rejects.toMatchObject({
        constructor: BadRequestException,
        response: {
          code: 'CATEGORIES_CSV_IMPORT_INVALID_FORMAT',
          detail: 'missing required column: nombre',
        },
      });
    });
  });

  describe('POST /categories/import/commit', () => {
    it('happy path: forwards payload + returns wrapped counts', async () => {
      const { controller, importService } = buildController({
        commit: jest.fn().mockResolvedValue({ created: 2, updated: 0, skipped: 1 }),
      });
      const payload = {
        new: [{ name: 'Frutas' }, { name: 'Manzanas', parentName: 'Frutas' }],
        duplicates: [
          { name: 'Verduras', existingId: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa' },
        ],
        mode: 'skip-duplicates' as const,
      };
      const wrapped = await controller.importCommit(ORG_ID, payload);
      expect(importService.commit).toHaveBeenCalledWith(ORG_ID, payload);
      expect(wrapped.data).toEqual({ created: 2, updated: 0, skipped: 1 });
    });

    it('translates CategoriesImportFormatError to 400', async () => {
      const { controller } = buildController({
        commit: jest.fn().mockRejectedValue(new CategoriesImportFormatError('bad mode')),
      });
      await expect(
        controller.importCommit(ORG_ID, {
          new: [],
          duplicates: [],
          mode: 'bogus' as unknown as 'skip-duplicates',
        }),
      ).rejects.toMatchObject({
        constructor: BadRequestException,
        response: {
          code: 'CATEGORIES_CSV_IMPORT_INVALID_FORMAT',
          detail: 'bad mode',
        },
      });
    });
  });

  describe('RBAC metadata', () => {
    it('preview + commit are OWNER-only', () => {
      const meta = (handler: unknown) =>
        Reflect.getMetadata(ROLES_METADATA_KEY, handler as (...args: unknown[]) => unknown);
      const preview = CategoriesController.prototype.importPreview;
      const commit = CategoriesController.prototype.importCommit;
      expect(meta(preview)).toEqual(['OWNER']);
      expect(meta(commit)).toEqual(['OWNER']);
    });
  });
});
