import { NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { ExportBundle } from '../domain/export-bundle.entity';
import type { BundleStorage } from '../storage/bundle-storage';
import { BundleStatusQuery } from './bundle-status.query';

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '99999999-9999-4999-8999-999999999999';

function makeRow(overrides: Partial<ExportBundle> = {}): ExportBundle {
  const row = new ExportBundle();
  row.id = overrides.id ?? 'b1';
  row.organizationId = overrides.organizationId ?? ORG;
  row.requestedByUserId = 'u1';
  row.rangeStart = new Date('2026-02-01T00:00:00Z');
  row.rangeEnd = new Date('2026-04-30T23:59:59Z');
  row.locale = 'es-ES';
  row.scope = ['haccp'];
  row.status = overrides.status ?? 'ready';
  row.pdfStoragePath = overrides.pdfStoragePath ?? `${ORG}/b1/pdf.bin`;
  row.csvStoragePath = overrides.csvStoragePath ?? `${ORG}/b1/csv.bin`;
  row.sha256 = overrides.sha256 ?? 'a'.repeat(64);
  row.pageCount = 12;
  row.byteSize = 4096;
  row.errorMessage = overrides.errorMessage ?? null;
  row.generatedAt = overrides.generatedAt ?? new Date('2026-05-01T14:32:00Z');
  row.archivedAt = null;
  row.deletedAt = null;
  row.createdAt = new Date('2026-05-01T14:00:00Z');
  return row;
}

function makeRepo(row: ExportBundle | null): Repository<ExportBundle> {
  return {
    findOne: jest.fn(async () => row),
  } as unknown as Repository<ExportBundle>;
}

function makeStorage(): BundleStorage {
  return {
    putBundle: jest.fn(),
    readBundle: jest.fn(),
    signedReadUrl: jest.fn(
      async (p) => `https://test/download?path=${encodeURIComponent(p)}`,
    ),
  };
}

describe('BundleStatusQuery.getBundleStatus', () => {
  it('returns the status view + signed download URLs for ready bundles', async () => {
    const row = makeRow({});
    const query = new BundleStatusQuery(makeRepo(row), makeStorage());
    const view = await query.getBundleStatus(ORG, 'b1');
    expect(view.status).toBe('ready');
    expect(view.sha256).toBe('a'.repeat(64));
    expect(view.pdfDownloadUrl).toContain('pdf.bin');
    expect(view.csvDownloadUrl).toContain('csv.bin');
  });

  it('omits download URLs when the bundle is not ready', async () => {
    const row = makeRow({ status: 'generating' });
    const query = new BundleStatusQuery(makeRepo(row), makeStorage());
    const view = await query.getBundleStatus(ORG, 'b1');
    expect(view.status).toBe('generating');
    expect(view.pdfDownloadUrl).toBeNull();
    expect(view.csvDownloadUrl).toBeNull();
  });

  it('throws NotFoundException when the bundle does not exist', async () => {
    const query = new BundleStatusQuery(makeRepo(null), makeStorage());
    await expect(query.getBundleStatus(ORG, 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('treats cross-tenant access as a 404 (no existence disclosure)', async () => {
    const row = makeRow({ organizationId: OTHER_ORG });
    const query = new BundleStatusQuery(makeRepo(row), makeStorage());
    await expect(query.getBundleStatus(ORG, 'b1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
