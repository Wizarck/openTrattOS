import {
  BadGatewayException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Response } from 'express';
import { LabelsController } from './labels.controller';
import {
  LabelOrganizationNotFoundError,
  LabelRecipeNotFoundError,
  MissingMandatoryFieldsError,
  PrintAdapterNotConfiguredError,
  PrintAdapterUnknownError,
  UnsupportedLocaleError,
} from '../application/errors';
import { PrintLabelDto } from './dto/print-label.dto';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const RECIPE_ID = '22222222-2222-4222-8222-222222222222';

function makeFakeRes() {
  const res: Partial<Response> & { sent: Buffer | null; headers: Record<string, string> } = {
    sent: null,
    headers: {},
    setHeader(name: string, value: string) {
      (this.headers as Record<string, string>)[name] = value;
      return this as unknown as Response;
    },
    send(buf: Buffer) {
      (this as { sent: Buffer | null }).sent = buf;
      return this as unknown as Response;
    },
  };
  return res as Response & { sent: Buffer | null; headers: Record<string, string> };
}

describe('LabelsController', () => {
  function buildController(serviceOverrides: Partial<{ renderLabel: jest.Mock; printLabel: jest.Mock }> = {}) {
    const service = {
      renderLabel: jest
        .fn()
        .mockResolvedValue({
          data: { locale: 'es', pageSize: 'a4' },
          pdf: Buffer.from('%PDF-mock'),
        }),
      printLabel: jest.fn().mockResolvedValue({ ok: true, jobId: 'job-42' }),
      ...serviceOverrides,
    };
    return { controller: new LabelsController(service as never), service };
  }

  describe('GET /recipes/:id/label', () => {
    it('streams the PDF with content-type and cache-control headers', async () => {
      const { controller } = buildController();
      const res = makeFakeRes();
      await controller.renderLabel(RECIPE_ID, ORG_ID, 'es', res);
      expect(res.headers['Content-Type']).toBe('application/pdf');
      expect(res.headers['Cache-Control']).toMatch(/private/);
      expect(res.sent?.toString('ascii')).toMatch(/%PDF/);
    });

    it('translates MissingMandatoryFieldsError to 422 with named missing fields', async () => {
      const { controller } = buildController({
        renderLabel: jest
          .fn()
          .mockRejectedValue(
            new MissingMandatoryFieldsError(['org.businessName', 'recipe.name']),
          ),
      });
      const res = makeFakeRes();
      await expect(controller.renderLabel(RECIPE_ID, ORG_ID, undefined, res)).rejects.toMatchObject({
        constructor: UnprocessableEntityException,
        response: {
          code: 'MISSING_MANDATORY_FIELDS',
          missing: ['org.businessName', 'recipe.name'],
        },
      });
    });

    it('translates UnsupportedLocaleError to 422', async () => {
      const { controller } = buildController({
        renderLabel: jest
          .fn()
          .mockRejectedValue(new UnsupportedLocaleError('zz', ['es', 'en', 'it'])),
      });
      const res = makeFakeRes();
      await expect(controller.renderLabel(RECIPE_ID, ORG_ID, 'zz', res)).rejects.toMatchObject({
        response: { code: 'UNSUPPORTED_LOCALE', supported: ['es', 'en', 'it'] },
      });
    });

    it('translates LabelRecipeNotFoundError to 404', async () => {
      const { controller } = buildController({
        renderLabel: jest.fn().mockRejectedValue(new LabelRecipeNotFoundError(RECIPE_ID)),
      });
      const res = makeFakeRes();
      await expect(controller.renderLabel(RECIPE_ID, ORG_ID, undefined, res)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('translates LabelOrganizationNotFoundError to 404', async () => {
      const { controller } = buildController({
        renderLabel: jest
          .fn()
          .mockRejectedValue(new LabelOrganizationNotFoundError(ORG_ID)),
      });
      const res = makeFakeRes();
      await expect(controller.renderLabel(RECIPE_ID, ORG_ID, undefined, res)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('POST /recipes/:id/print', () => {
    function buildDto(overrides: Partial<PrintLabelDto> = {}): PrintLabelDto {
      const dto = new PrintLabelDto();
      dto.organizationId = ORG_ID;
      dto.locale = overrides.locale;
      dto.copies = overrides.copies;
      dto.printerId = overrides.printerId;
      return dto;
    }

    it('returns ok+jobId on successful dispatch', async () => {
      const { controller } = buildController();
      const result = await controller.printLabel(RECIPE_ID, buildDto({ locale: 'es' }));
      expect(result.ok).toBe(true);
      expect(result.jobId).toBe('job-42');
    });

    it('returns 502 when adapter PrintResult.ok = false', async () => {
      const { controller } = buildController({
        printLabel: jest.fn().mockResolvedValue({
          ok: false,
          error: { code: 'PRINTER_UNREACHABLE', message: 'unreachable' },
        }),
      });
      await expect(controller.printLabel(RECIPE_ID, buildDto())).rejects.toBeInstanceOf(
        BadGatewayException,
      );
    });

    it('translates PrintAdapterNotConfiguredError to 422', async () => {
      const { controller } = buildController({
        printLabel: jest
          .fn()
          .mockRejectedValue(new PrintAdapterNotConfiguredError(ORG_ID)),
      });
      await expect(controller.printLabel(RECIPE_ID, buildDto())).rejects.toMatchObject({
        response: { code: 'PRINT_ADAPTER_NOT_CONFIGURED' },
      });
    });

    it('translates PrintAdapterUnknownError to 422', async () => {
      const { controller } = buildController({
        printLabel: jest.fn().mockRejectedValue(new PrintAdapterUnknownError('nope')),
      });
      await expect(controller.printLabel(RECIPE_ID, buildDto())).rejects.toMatchObject({
        response: { code: 'PRINT_ADAPTER_UNKNOWN', adapterId: 'nope' },
      });
    });
  });
});
