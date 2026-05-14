import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { ExportBundle } from '../domain/export-bundle.entity';
import type { BundleArchiveRow, ScopeKind } from '../types';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

/**
 * Read-only query — the j9 archive table is driven by this. Backed by
 * `idx_export_bundles_org_created_at` for the tenant-scoped DESC scan.
 */
@Injectable()
export class BundleArchiveQuery {
  constructor(
    @InjectRepository(ExportBundle)
    private readonly repo: Repository<ExportBundle>,
  ) {}

  async recentBundles(
    organizationId: string,
    limit: number = DEFAULT_LIMIT,
  ): Promise<BundleArchiveRow[]> {
    const clamped = Math.min(Math.max(1, Math.floor(limit)), MAX_LIMIT);
    const rows = await this.repo.find({
      where: { organizationId, deletedAt: IsNull() },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: clamped,
    });
    return rows.map(toArchiveRow);
  }
}

function toArchiveRow(row: ExportBundle): BundleArchiveRow {
  return {
    id: row.id,
    rangeStart: row.rangeStart.toISOString(),
    rangeEnd: row.rangeEnd.toISOString(),
    locale: row.locale,
    scope: row.scope as ScopeKind[],
    status: row.status,
    sha256: row.sha256,
    pageCount: row.pageCount,
    byteSize: row.byteSize,
    generatedAt: row.generatedAt ? row.generatedAt.toISOString() : null,
    requestedByUserId: row.requestedByUserId,
    createdAt: row.createdAt.toISOString(),
  };
}
