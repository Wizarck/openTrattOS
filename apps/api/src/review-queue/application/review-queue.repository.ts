import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type {
  ListFlaggedOptions,
  ListFlaggedResult,
  ReviewQueueGrDetails,
  ReviewQueueLotDetails,
  ReviewQueueRow,
  StaleAggregateSummary,
  StaleAggregatesByOrg,
} from './types';
import {
  REVIEW_QUEUE_DEFAULT_LIMIT,
  REVIEW_QUEUE_MAX_LIMIT,
  REVIEW_QUEUE_STALE_MAX_ROWS_PER_ORG,
} from './types';

/**
 * Raw-SQL repository for the review-queue BC
 * (`m3.x-review-queue-backend`). Lives in its own BC per
 * ADR-CROSS-BC-SUBSCRIBER-LOCATION (slice #21) to avoid coupling
 * inventory + procurement to a cross-aggregate read concern.
 *
 * `flaggedAt` is derived from the most-recent `LOT_FLAGGED_FOR_REVIEW`
 * / `GR_FLAGGED_FOR_REVIEW` audit envelope for the row. TypeORM's
 * `@UpdateDateColumn` is unreliable here because the listener slice
 * (#157) flips `requires_review=true` via raw SQL UPDATE, which does
 * NOT trigger TypeORM's auto-update. The audit-log envelope is the
 * canonical signal. The partial index
 * `ix_audit_log_aggregate(organization_id, aggregate_type, aggregate_id,
 * created_at)` makes the correlated lookup cheap.
 *
 * The graceful 42703 probe catches deployments that have not yet
 * applied migration 0041 (which brings the `requires_review` column
 * into `lots` + `goods_receipts`). Mirrors the
 * `DownstreamRevocationRepository` pattern.
 */
interface LotQueueRowRaw {
  aggregate_id: string;
  organization_id: string;
  source_photo_ingestion_id: string | null;
  received_at: Date;
  location_id: string;
  supplier_id: string | null;
  unit: string;
  flagged_at: Date | null;
}

interface GrQueueRowRaw {
  aggregate_id: string;
  organization_id: string;
  source_photo_ingestion_id: string | null;
  received_at: Date;
  supplier_id: string;
  supplier_invoice_ref: string | null;
  received_at_location_id: string;
  flagged_at: Date | null;
}

interface ClearRawRow {
  was_flagged: boolean;
  source_photo_ingestion_id: string | null;
}

@Injectable()
export class ReviewQueueRepository {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async listFlagged(
    organizationId: string,
    opts: ListFlaggedOptions = {},
  ): Promise<ListFlaggedResult> {
    const limit = this.clampLimit(opts.limit);
    // Fetch one extra row per aggregate type so we can detect truncation
    // without an extra COUNT roundtrip. After merging + sorting we slice
    // back to `limit`.
    const probeLimit = limit + 1;

    let lotRows: LotQueueRowRaw[] = [];
    let grRows: GrQueueRowRaw[] = [];

    if (opts.aggregateType !== 'goods_receipt') {
      lotRows = await this.queryFlaggedLots(organizationId, probeLimit);
    }
    if (opts.aggregateType !== 'lot') {
      grRows = await this.queryFlaggedGrs(organizationId, probeLimit);
    }

    const merged: ReviewQueueRow[] = [
      ...lotRows.map(toLotRow),
      ...grRows.map(toGrRow),
    ];
    // Newest-first by flagged_at. Null flagged_at (no audit envelope yet,
    // unlikely but possible if the row was hand-flagged) sinks to the
    // bottom.
    merged.sort((a, b) => {
      if (a.flaggedAt === b.flaggedAt) return 0;
      if (!a.flaggedAt) return 1;
      if (!b.flaggedAt) return -1;
      return b.flaggedAt.localeCompare(a.flaggedAt);
    });

    const truncated = merged.length > limit;
    return {
      rows: truncated ? merged.slice(0, limit) : merged,
      truncated,
    };
  }

  async clearLotReview(
    organizationId: string,
    lotId: string,
  ): Promise<{ cleared: boolean; alreadyClear: boolean; sourcePhotoIngestionId: string | null }> {
    try {
      const result: ClearRawRow[] = await this.dataSource.query(
        `WITH prior AS (
          SELECT "id", "source_photo_ingestion_id", "requires_review" AS was_flagged
          FROM "lots"
          WHERE "id" = $1 AND "organization_id" = $2
        ),
        upd AS (
          UPDATE "lots"
            SET "requires_review" = false
          WHERE "id" = $1 AND "organization_id" = $2 AND "requires_review" = true
          RETURNING "id"
        )
        SELECT prior.was_flagged, prior.source_photo_ingestion_id
        FROM prior`,
        [lotId, organizationId],
      );
      return this.interpretClearResult(result);
    } catch (err) {
      if (this.isUndefinedColumn(err)) {
        // Migration 0041 not applied on this deployment; treat as
        // already-clear so callers don't see a 500.
        return { cleared: true, alreadyClear: true, sourcePhotoIngestionId: null };
      }
      throw err;
    }
  }

  async clearGrReview(
    organizationId: string,
    grId: string,
  ): Promise<{ cleared: boolean; alreadyClear: boolean; sourcePhotoIngestionId: string | null }> {
    try {
      const result: ClearRawRow[] = await this.dataSource.query(
        `WITH prior AS (
          SELECT "id", "source_photo_ingestion_id", "requires_review" AS was_flagged
          FROM "goods_receipts"
          WHERE "id" = $1 AND "organization_id" = $2
        ),
        upd AS (
          UPDATE "goods_receipts"
            SET "requires_review" = false
          WHERE "id" = $1 AND "organization_id" = $2 AND "requires_review" = true
          RETURNING "id"
        )
        SELECT prior.was_flagged, prior.source_photo_ingestion_id
        FROM prior`,
        [grId, organizationId],
      );
      return this.interpretClearResult(result);
    } catch (err) {
      if (this.isUndefinedColumn(err)) {
        return { cleared: true, alreadyClear: true, sourcePhotoIngestionId: null };
      }
      throw err;
    }
  }

  private interpretClearResult(result: ClearRawRow[]): {
    cleared: boolean;
    alreadyClear: boolean;
    sourcePhotoIngestionId: string | null;
  } {
    if (result.length === 0) {
      // Cross-tenant lookup OR unknown id — same shape as already-clear
      // per ADR-NO-EXISTENCE-DISCLOSURE. Caller treats as no-op.
      return { cleared: true, alreadyClear: true, sourcePhotoIngestionId: null };
    }
    const row = result[0];
    return {
      cleared: true,
      alreadyClear: !row.was_flagged,
      sourcePhotoIngestionId: row.source_photo_ingestion_id,
    };
  }

  private async queryFlaggedLots(
    organizationId: string,
    limit: number,
  ): Promise<LotQueueRowRaw[]> {
    try {
      return await this.dataSource.query(
        `SELECT l."id" AS aggregate_id,
                l."organization_id",
                l."source_photo_ingestion_id",
                l."received_at",
                l."location_id",
                l."supplier_id",
                l."unit",
                (SELECT al."created_at"
                   FROM "audit_log" al
                  WHERE al."organization_id" = l."organization_id"
                    AND al."aggregate_type" = 'lot'
                    AND al."aggregate_id" = l."id"
                    AND al."event_type" = 'LOT_FLAGGED_FOR_REVIEW'
                  ORDER BY al."created_at" DESC
                  LIMIT 1) AS flagged_at
           FROM "lots" l
          WHERE l."organization_id" = $1
            AND l."requires_review" = true
          ORDER BY flagged_at DESC NULLS LAST
          LIMIT $2`,
        [organizationId, limit],
      );
    } catch (err) {
      if (this.isUndefinedColumn(err)) return [];
      throw err;
    }
  }

  private async queryFlaggedGrs(
    organizationId: string,
    limit: number,
  ): Promise<GrQueueRowRaw[]> {
    try {
      return await this.dataSource.query(
        `SELECT gr."id" AS aggregate_id,
                gr."organization_id",
                gr."source_photo_ingestion_id",
                gr."received_at",
                gr."supplier_id",
                gr."supplier_invoice_ref",
                gr."received_at_location_id",
                (SELECT al."created_at"
                   FROM "audit_log" al
                  WHERE al."organization_id" = gr."organization_id"
                    AND al."aggregate_type" = 'goods_receipt'
                    AND al."aggregate_id" = gr."id"
                    AND al."event_type" = 'GR_FLAGGED_FOR_REVIEW'
                  ORDER BY al."created_at" DESC
                  LIMIT 1) AS flagged_at
           FROM "goods_receipts" gr
          WHERE gr."organization_id" = $1
            AND gr."requires_review" = true
          ORDER BY flagged_at DESC NULLS LAST
          LIMIT $2`,
        [organizationId, limit],
      );
    } catch (err) {
      if (this.isUndefinedColumn(err)) return [];
      throw err;
    }
  }

  /**
   * Stale-notifier query (`m3.x-requires-review-clear-cron`). Returns
   * every `requires_review=true` aggregate (Lot + GR) across ALL
   * organizations whose `flagged_at` is older than `thresholdDays`,
   * grouped by `organizationId`. Per-org rows are capped at
   * `REVIEW_QUEUE_STALE_MAX_ROWS_PER_ORG` (oldest-first within the cap,
   * so the most overdue rows surface even when truncated).
   *
   * The query uses the same `flagged_at` correlated-subquery pattern as
   * `queryFlaggedLots` / `queryFlaggedGrs`, filtered by the threshold.
   * Rows whose `flagged_at` derivation returns NULL (audit envelope
   * missing) are excluded from the result set — they cannot be stale
   * against a threshold we have no anchor for. This matches operator
   * expectations: a Lot that was hand-flagged via SQL (no envelope) is
   * not auto-surfaced; the j-screen still shows it.
   *
   * 42703 graceful probe mirrors `queryFlaggedLots` so deployments
   * pre-migration 0041 return an empty array rather than throwing.
   *
   * Caller responsibility: convert each `StaleAggregatesByOrg` into an
   * envelope and emit per-organization. The repository does NOT touch
   * the bus; the scanner does (per ADR-CROSS-BC-SUBSCRIBER-LOCATION).
   */
  async findStaleAggregatesGroupedByOrg(
    thresholdDays: number,
  ): Promise<StaleAggregatesByOrg[]> {
    if (!Number.isFinite(thresholdDays) || thresholdDays < 1) {
      throw new Error(
        `thresholdDays must be a positive integer; got ${thresholdDays}`,
      );
    }
    let lotRows: StaleAggregateSummary[] = [];
    let grRows: StaleAggregateSummary[] = [];
    try {
      lotRows = await this.queryStaleLots(thresholdDays);
    } catch (err) {
      if (!this.isUndefinedColumn(err)) throw err;
    }
    try {
      grRows = await this.queryStaleGrs(thresholdDays);
    } catch (err) {
      if (!this.isUndefinedColumn(err)) throw err;
    }

    // Group by organizationId, preserving oldest-first within each org so
    // a truncating cap surfaces the most overdue rows.
    const byOrg = new Map<string, StaleAggregateSummary[]>();
    const orderedOrgIds: string[] = [];
    for (const row of [...lotRows, ...grRows]) {
      const orgId = (row as StaleAggregateSummary & { organizationId: string })
        .organizationId;
      const summary: StaleAggregateSummary = {
        aggregateType: row.aggregateType,
        aggregateId: row.aggregateId,
        flaggedAt: row.flaggedAt,
        sourcePhotoIngestionId: row.sourcePhotoIngestionId,
      };
      const existing = byOrg.get(orgId);
      if (existing === undefined) {
        byOrg.set(orgId, [summary]);
        orderedOrgIds.push(orgId);
      } else {
        existing.push(summary);
      }
    }

    return orderedOrgIds.map((organizationId) => {
      const rows = byOrg.get(organizationId) ?? [];
      // Sort oldest-first so the truncation cap retains the rows that
      // have been waiting longest.
      rows.sort((a, b) => a.flaggedAt.localeCompare(b.flaggedAt));
      return {
        organizationId,
        rows: rows.slice(0, REVIEW_QUEUE_STALE_MAX_ROWS_PER_ORG),
      };
    });
  }

  private async queryStaleLots(
    thresholdDays: number,
  ): Promise<Array<StaleAggregateSummary & { organizationId: string }>> {
    const raw: Array<{
      organization_id: string;
      aggregate_id: string;
      source_photo_ingestion_id: string | null;
      flagged_at: Date;
    }> = await this.dataSource.query(
      `SELECT l."organization_id",
              l."id" AS aggregate_id,
              l."source_photo_ingestion_id",
              flagged.created_at AS flagged_at
         FROM "lots" l
         JOIN LATERAL (
           SELECT al."created_at"
             FROM "audit_log" al
            WHERE al."organization_id" = l."organization_id"
              AND al."aggregate_type" = 'lot'
              AND al."aggregate_id" = l."id"
              AND al."event_type" = 'LOT_FLAGGED_FOR_REVIEW'
            ORDER BY al."created_at" DESC
            LIMIT 1
         ) flagged ON true
        WHERE l."requires_review" = true
          AND flagged.created_at < (now() - ($1 || ' days')::interval)`,
      [String(thresholdDays)],
    );
    return raw.map((r) => ({
      organizationId: r.organization_id,
      aggregateType: 'lot',
      aggregateId: r.aggregate_id,
      sourcePhotoIngestionId: r.source_photo_ingestion_id,
      flaggedAt: r.flagged_at.toISOString(),
    }));
  }

  private async queryStaleGrs(
    thresholdDays: number,
  ): Promise<Array<StaleAggregateSummary & { organizationId: string }>> {
    const raw: Array<{
      organization_id: string;
      aggregate_id: string;
      source_photo_ingestion_id: string | null;
      flagged_at: Date;
    }> = await this.dataSource.query(
      `SELECT gr."organization_id",
              gr."id" AS aggregate_id,
              gr."source_photo_ingestion_id",
              flagged.created_at AS flagged_at
         FROM "goods_receipts" gr
         JOIN LATERAL (
           SELECT al."created_at"
             FROM "audit_log" al
            WHERE al."organization_id" = gr."organization_id"
              AND al."aggregate_type" = 'goods_receipt'
              AND al."aggregate_id" = gr."id"
              AND al."event_type" = 'GR_FLAGGED_FOR_REVIEW'
            ORDER BY al."created_at" DESC
            LIMIT 1
         ) flagged ON true
        WHERE gr."requires_review" = true
          AND flagged.created_at < (now() - ($1 || ' days')::interval)`,
      [String(thresholdDays)],
    );
    return raw.map((r) => ({
      organizationId: r.organization_id,
      aggregateType: 'goods_receipt',
      aggregateId: r.aggregate_id,
      sourcePhotoIngestionId: r.source_photo_ingestion_id,
      flaggedAt: r.flagged_at.toISOString(),
    }));
  }

  private clampLimit(raw: number | undefined): number {
    if (raw === undefined) return REVIEW_QUEUE_DEFAULT_LIMIT;
    if (!Number.isInteger(raw) || raw < 1) return REVIEW_QUEUE_DEFAULT_LIMIT;
    return Math.min(raw, REVIEW_QUEUE_MAX_LIMIT);
  }

  /**
   * Postgres error code `42703` (`undefined_column`). TypeORM surfaces
   * this either at the top level or nested in `driverError`, depending
   * on whether the connection pool wrapped it. Same probe pattern as
   * `DownstreamRevocationRepository`.
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

function toLotRow(r: LotQueueRowRaw): ReviewQueueRow {
  const details: ReviewQueueLotDetails = {
    aggregateType: 'lot',
    receivedAt: r.received_at.toISOString(),
    locationId: r.location_id,
    supplierId: r.supplier_id,
    unit: r.unit,
  };
  return {
    aggregateType: 'lot',
    aggregateId: r.aggregate_id,
    organizationId: r.organization_id,
    sourcePhotoIngestionId: r.source_photo_ingestion_id,
    details,
    flaggedAt: r.flagged_at
      ? r.flagged_at.toISOString()
      : '1970-01-01T00:00:00.000Z',
  };
}

function toGrRow(r: GrQueueRowRaw): ReviewQueueRow {
  const details: ReviewQueueGrDetails = {
    aggregateType: 'goods_receipt',
    receivedAt: r.received_at.toISOString(),
    supplierId: r.supplier_id,
    supplierInvoiceRef: r.supplier_invoice_ref,
    receivedAtLocationId: r.received_at_location_id,
  };
  return {
    aggregateType: 'goods_receipt',
    aggregateId: r.aggregate_id,
    organizationId: r.organization_id,
    sourcePhotoIngestionId: r.source_photo_ingestion_id,
    details,
    flaggedAt: r.flagged_at
      ? r.flagged_at.toISOString()
      : '1970-01-01T00:00:00.000Z',
  };
}
