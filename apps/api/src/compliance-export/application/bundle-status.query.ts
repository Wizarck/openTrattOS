import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExportBundle } from '../domain/export-bundle.entity';
import { BUNDLE_STORAGE, type BundleStorage } from '../storage/bundle-storage';
import type { BundleStatusView, RecipientReceipt, ScopeKind } from '../types';

/**
 * Read-only query — drives the j9 progress strip + download row.
 * Cross-tenant: a bundle that belongs to a different org returns 404
 * (NotFoundException) so existence is not disclosed.
 */
@Injectable()
export class BundleStatusQuery {
  constructor(
    @InjectRepository(ExportBundle)
    private readonly repo: Repository<ExportBundle>,
    @Inject(BUNDLE_STORAGE) private readonly storage: BundleStorage,
  ) {}

  async getBundleStatus(
    organizationId: string,
    bundleId: string,
    receipts: ReadonlyArray<RecipientReceipt> = [],
  ): Promise<BundleStatusView> {
    const row = await this.repo.findOne({ where: { id: bundleId } });
    if (!row || row.organizationId !== organizationId) {
      throw new NotFoundException({
        code: 'BUNDLE_NOT_FOUND',
        message: 'export bundle not found',
      });
    }
    const ready = row.status === 'ready' && row.pdfStoragePath && row.csvStoragePath;
    const pdfDownloadUrl = ready
      ? await this.storage.signedReadUrl(row.pdfStoragePath as string)
      : null;
    const csvDownloadUrl = ready
      ? await this.storage.signedReadUrl(row.csvStoragePath as string)
      : null;
    return {
      id: row.id,
      status: row.status,
      sha256: row.sha256,
      pageCount: row.pageCount,
      byteSize: row.byteSize,
      generatedAt: row.generatedAt ? row.generatedAt.toISOString() : null,
      errorMessage: row.errorMessage,
      pdfDownloadUrl,
      csvDownloadUrl,
      recipientReceipts: receipts,
      locale: row.locale,
      scope: row.scope as ScopeKind[],
      rangeStart: row.rangeStart.toISOString(),
      rangeEnd: row.rangeEnd.toISOString(),
    };
  }
}
