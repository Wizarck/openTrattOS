import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUserPayload } from '../../shared/guards/roles.guard';
import { ROLES_METADATA_KEY } from '../../shared/decorators/roles.decorator';
import type { BundleArchiveQuery } from '../application/bundle-archive.query';
import type { BundleGeneratorService } from '../application/bundle-generator.service';
import type { BundleStatusQuery } from '../application/bundle-status.query';
import type { BundleStorage } from '../storage/bundle-storage';
import { BundleController } from './bundle.controller';

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '99999999-9999-4999-8999-999999999999';
const USER = '22222222-2222-4222-8222-222222222222';
const BUNDLE = '33333333-3333-4333-8333-333333333333';

function fakeReq(user: AuthenticatedUserPayload | undefined): Request {
  return { user } as unknown as Request;
}

function buildCtrl(overrides: {
  generator?: Partial<BundleGeneratorService>;
  archive?: Partial<BundleArchiveQuery>;
  status?: Partial<BundleStatusQuery>;
  storage?: Partial<BundleStorage>;
} = {}): {
  ctrl: BundleController;
  generator: jest.Mocked<Pick<BundleGeneratorService, 'generate' | 'progressStream'>>;
  archive: jest.Mocked<Pick<BundleArchiveQuery, 'recentBundles'>>;
  status: jest.Mocked<Pick<BundleStatusQuery, 'getBundleStatus'>>;
  storage: jest.Mocked<BundleStorage>;
} {
  const generator = {
    generate: jest.fn(),
    progressStream: jest.fn(),
    ...overrides.generator,
  } as unknown as jest.Mocked<Pick<BundleGeneratorService, 'generate' | 'progressStream'>>;
  const archive = {
    recentBundles: jest.fn().mockResolvedValue([]),
    ...overrides.archive,
  } as unknown as jest.Mocked<Pick<BundleArchiveQuery, 'recentBundles'>>;
  const status = {
    getBundleStatus: jest.fn(),
    ...overrides.status,
  } as unknown as jest.Mocked<Pick<BundleStatusQuery, 'getBundleStatus'>>;
  const storage = {
    putBundle: jest.fn(),
    readBundle: jest.fn(),
    signedReadUrl: jest.fn(),
    ...overrides.storage,
  } as unknown as jest.Mocked<BundleStorage>;

  const ctrl = new BundleController(
    generator as unknown as BundleGeneratorService,
    archive as unknown as BundleArchiveQuery,
    status as unknown as BundleStatusQuery,
    storage,
  );
  return { ctrl, generator, archive, status, storage };
}

describe('BundleController', () => {
  describe('@Roles metadata', () => {
    it('declares OWNER + MANAGER on every mutating + read endpoint', () => {
      const proto = BundleController.prototype as unknown as Record<
        string,
        unknown
      >;
      for (const method of [
        'generate',
        'listRecent',
        'getStatus',
        'downloadPdf',
        'downloadCsv',
      ]) {
        const meta = Reflect.getMetadata(
          ROLES_METADATA_KEY,
          (proto[method] as unknown as object),
        );
        expect(meta).toEqual(['OWNER', 'MANAGER']);
      }
    });
  });

  describe('POST /', () => {
    it('rejects unauthenticated callers with 401', async () => {
      const { ctrl } = buildCtrl();
      await expect(
        ctrl.generate(
          {
            organizationId: ORG,
            rangeStart: new Date('2026-02-01'),
            rangeEnd: new Date('2026-04-30'),
            locale: 'es-ES',
            scope: ['haccp'],
          },
          fakeReq(undefined),
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects cross-org callers with 403', async () => {
      const { ctrl } = buildCtrl();
      await expect(
        ctrl.generate(
          {
            organizationId: OTHER_ORG,
            rangeStart: new Date('2026-02-01'),
            rangeEnd: new Date('2026-04-30'),
            locale: 'es-ES',
            scope: [],
          },
          fakeReq({ userId: USER, organizationId: ORG, role: 'OWNER' }),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('forwards a valid request to the generator', async () => {
      const { ctrl, generator } = buildCtrl();
      generator.generate.mockResolvedValue({
        bundleId: BUNDLE,
        status: 'ready',
        receipts: [],
      });
      const result = await ctrl.generate(
        {
          organizationId: ORG,
          rangeStart: new Date('2026-02-01'),
          rangeEnd: new Date('2026-04-30'),
          locale: 'es-ES',
          scope: ['haccp', 'lot'],
          recipientEmails: ['marta@example.com'],
        },
        fakeReq({ userId: USER, organizationId: ORG, role: 'OWNER' }),
      );
      expect(result).toEqual({
        bundleId: BUNDLE,
        status: 'ready',
        recipientReceipts: [],
      });
      expect(generator.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: ORG,
          requestedByUserId: USER,
          locale: 'es-ES',
          scope: ['haccp', 'lot'],
          recipientEmails: ['marta@example.com'],
        }),
      );
    });
  });

  describe('GET /:bundleId', () => {
    it('rejects cross-org callers with 403', async () => {
      const { ctrl } = buildCtrl();
      await expect(
        ctrl.getStatus(
          BUNDLE,
          { organizationId: OTHER_ORG },
          fakeReq({ userId: USER, organizationId: ORG, role: 'MANAGER' }),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('forwards to BundleStatusQuery', async () => {
      const { ctrl, status } = buildCtrl();
      status.getBundleStatus.mockResolvedValue({
        id: BUNDLE,
        status: 'ready',
        sha256: 'a'.repeat(64),
        pageCount: 12,
        byteSize: 4096,
        generatedAt: '2026-05-01T14:32:00.000Z',
        errorMessage: null,
        pdfDownloadUrl: 'https://test/pdf',
        csvDownloadUrl: 'https://test/csv',
        recipientReceipts: [],
        locale: 'es-ES',
        scope: ['haccp'],
        rangeStart: '2026-02-01T00:00:00.000Z',
        rangeEnd: '2026-04-30T23:59:59.000Z',
      });
      const view = await ctrl.getStatus(
        BUNDLE,
        { organizationId: ORG },
        fakeReq({ userId: USER, organizationId: ORG, role: 'OWNER' }),
      );
      expect(view.status).toBe('ready');
    });
  });

  describe('GET / (archive list)', () => {
    it('forwards limit to BundleArchiveQuery and asserts org match', async () => {
      const { ctrl, archive } = buildCtrl();
      await ctrl.listRecent(
        { organizationId: ORG, limit: 5 },
        fakeReq({ userId: USER, organizationId: ORG, role: 'OWNER' }),
      );
      expect(archive.recentBundles).toHaveBeenCalledWith(ORG, 5);
    });
  });
});
