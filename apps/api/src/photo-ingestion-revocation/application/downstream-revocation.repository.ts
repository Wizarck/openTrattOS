import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Result of probing one downstream aggregate table for rows linked to a
 * given photo-ingestion item. Used by `DownstreamRevocationSubscriber` to
 * decide whether to flip `requires_review=true` on the matched rows.
 *
 * The `columnExists` discriminator lets the subscriber emit
 * `DOWNSTREAM_REVOCATION_DEFERRED` per ADR-COLUMN-EXISTS-GRACEFUL-PROBE
 * if the deployment has not run migration 0041 — instead of letting the
 * UPDATE fail mid-event and silently corrupt the chain of custody.
 */
export type DownstreamProbeResult =
  | { columnExists: true; flaggedRowIds: string[] }
  | { columnExists: false };

/**
 * Raw SQL repository for the downstream-revocation flow. Lives in its own
 * BC (`photo-ingestion-revocation`) per ADR-SUBSCRIBER-FAN-OUT to avoid
 * coupling the inventory + procurement BCs to the photo-ingestion bus
 * channel.
 *
 * Every method gates on `organizationId` to honour the multi-tenant
 * invariant. Both flag operations are idempotent: re-running them on a
 * row that already carries `requires_review=true` is a no-op (the UPDATE
 * matches the same set but sets the column to `true` again).
 *
 * The graceful probe pattern catches Postgres error code `42703`
 * (`undefined_column`) on the `requires_review` column. Migration 0041
 * brings the column in via the H1b producer slice; deployments that
 * have not yet applied 0041 will hit this branch and surface a
 * `DOWNSTREAM_REVOCATION_DEFERRED` audit envelope.
 */
@Injectable()
export class DownstreamRevocationRepository {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async flagLotsBySourcePhotoIngestion(
    organizationId: string,
    photoIngestionItemId: string,
  ): Promise<DownstreamProbeResult> {
    try {
      const rows: Array<{ id: string }> = await this.dataSource.query(
        `UPDATE "lots"
           SET "requires_review" = true
         WHERE "organization_id" = $1
           AND "source_photo_ingestion_id" = $2
         RETURNING "id"`,
        [organizationId, photoIngestionItemId],
      );
      return {
        columnExists: true,
        flaggedRowIds: rows.map((r) => r.id),
      };
    } catch (err) {
      if (this.isUndefinedColumn(err)) {
        return { columnExists: false };
      }
      throw err;
    }
  }

  async flagGoodsReceiptsBySourcePhotoIngestion(
    organizationId: string,
    photoIngestionItemId: string,
  ): Promise<DownstreamProbeResult> {
    try {
      const rows: Array<{ id: string }> = await this.dataSource.query(
        `UPDATE "goods_receipts"
           SET "requires_review" = true
         WHERE "organization_id" = $1
           AND "source_photo_ingestion_id" = $2
         RETURNING "id"`,
        [organizationId, photoIngestionItemId],
      );
      return {
        columnExists: true,
        flaggedRowIds: rows.map((r) => r.id),
      };
    } catch (err) {
      if (this.isUndefinedColumn(err)) {
        return { columnExists: false };
      }
      throw err;
    }
  }

  /**
   * Postgres error code `42703` (`undefined_column`). TypeORM surfaces
   * this either at the top level or nested in `driverError`, depending
   * on whether the connection pool wrapped it.
   */
  private isUndefinedColumn(err: unknown): boolean {
    if (!err || typeof err !== 'object') return false;
    const e = err as { code?: unknown; driverError?: { code?: unknown } };
    if (e.code === '42703') return true;
    if (
      e.driverError &&
      typeof e.driverError === 'object' &&
      (e.driverError as { code?: unknown }).code === '42703'
    ) {
      return true;
    }
    return false;
  }
}
