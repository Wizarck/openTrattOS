import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Brackets, DataSource, SelectQueryBuilder } from 'typeorm';
import { AuditLog } from '../domain/audit-log.entity';
import { ES_VECTOR_SQL, EN_VECTOR_SQL } from './audit-log-fts.sql';
import { AuditLogQueryError } from './errors';
import {
  AuditEventEnvelope,
  AuditLogFilter,
  AuditLogPage,
} from './types';

export const AUDIT_LOG_DEFAULT_LIMIT = 50;
export const AUDIT_LOG_MAX_LIMIT = 200;
export const AUDIT_LOG_DEFAULT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Hard cap on rows emitted by `streamRows()` per export request. Protects the
 * API from runaway exports. When exceeded, the controller signals truncation
 * via the `X-Audit-Log-Export-Truncated: true` response header. Operators
 * narrow the date window and re-run.
 */
export const AUDIT_LOG_EXPORT_HARD_CAP = 100_000;

/** Batch size for `streamRows()` cursor pagination. One round-trip per batch. */
export const AUDIT_LOG_EXPORT_BATCH_SIZE = 1_000;

/** Cursor handed across `streamRows()` batches — the previous batch's last (createdAt, id). */
export interface AuditLogStreamCursor {
  createdAt: Date;
  id: string;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Persist one audit row. Returns the saved entity. */
  async record(eventType: string, envelope: AuditEventEnvelope): Promise<AuditLog> {
    const repo = this.dataSource.getRepository(AuditLog);
    const row = new AuditLog();
    row.id = randomUUID();
    row.organizationId = envelope.organizationId;
    row.eventType = eventType;
    row.aggregateType = envelope.aggregateType;
    row.aggregateId = envelope.aggregateId;
    row.actorUserId = envelope.actorUserId;
    row.actorKind = envelope.actorKind;
    row.agentName = envelope.agentName ?? null;
    row.payloadBefore = envelope.payloadBefore ?? null;
    row.payloadAfter = envelope.payloadAfter ?? null;
    row.reason = envelope.reason ?? null;
    row.citationUrl = envelope.citationUrl ?? null;
    row.snippet = envelope.snippet ?? null;
    row.createdAt = new Date();
    return repo.save(row);
  }

  /**
   * Filtered + paginated query. Default window = last 30 days. Limit clamped
   * to [1, 200]. Returns `{ rows, total, limit, offset }`. When `filter.q` is
   * set, ordering is by `ts_rank` DESC + `created_at` DESC tiebreaker;
   * otherwise plain `created_at DESC`.
   */
  async query(filter: AuditLogFilter): Promise<AuditLogPage<AuditLog>> {
    const limit = this.normaliseLimit(filter.limit);
    const offset = this.normaliseOffset(filter.offset);
    const { since, until } = this.normaliseRange(filter.since, filter.until);

    const qb = this.dataSource.getRepository(AuditLog).createQueryBuilder('a');
    this.applyBaseFilters(qb, filter, since, until);

    if (filter.q && filter.q.length > 0) {
      // Relevance-first ordering, recency as tiebreaker. GREATEST takes the
      // higher of the two per-config ranks so a row matching strongly in only
      // one language still surfaces high.
      qb.orderBy(
        `GREATEST(
          ts_rank((${ES_VECTOR_SQL}), plainto_tsquery('spanish', :q)),
          ts_rank((${EN_VECTOR_SQL}), plainto_tsquery('english', :q))
        )`,
        'DESC',
      ).addOrderBy('a.created_at', 'DESC');
    } else {
      qb.orderBy('a.created_at', 'DESC');
    }

    qb.skip(offset).take(limit);

    const [rows, total] = await qb.getManyAndCount();
    return { rows, total, limit, offset };
  }

  /**
   * Async generator yielding `audit_log` rows that match `filter`, ordered by
   * `(created_at DESC, id DESC)` (stable for compliance reproducibility — NOT
   * by `ts_rank` even when `q` is set). Internally cursor-paginates in
   * batches of `AUDIT_LOG_EXPORT_BATCH_SIZE`. Stops AFTER yielding `hardCap`
   * rows or when the source is exhausted, whichever first.
   *
   * Constant memory: at any moment only one batch (1 K rows) is in memory.
   */
  async *streamRows(
    filter: AuditLogFilter,
    hardCap: number = AUDIT_LOG_EXPORT_HARD_CAP,
  ): AsyncGenerator<AuditLog> {
    let cursor: AuditLogStreamCursor | undefined = undefined;
    let emitted = 0;
    while (emitted < hardCap) {
      const want = Math.min(AUDIT_LOG_EXPORT_BATCH_SIZE, hardCap - emitted);
      const batch = await this.cursorBatch(filter, cursor, want);
      if (batch.length === 0) return;
      for (const row of batch) {
        yield row;
        emitted++;
        if (emitted >= hardCap) return;
      }
      const last = batch[batch.length - 1];
      cursor = { createdAt: last.createdAt, id: last.id };
    }
  }

  /**
   * Returns `true` if the matching result set strictly exceeds `cap`. Backed
   * by a capped subquery `SELECT count(*) FROM (… LIMIT cap+1) sub` so the
   * cost stays bounded even on tables with millions of rows.
   *
   * Used by the export endpoint to set `X-Audit-Log-Export-Truncated: true`
   * BEFORE the response body starts streaming (HTTP headers cannot be added
   * mid-stream).
   */
  async wouldExceedCap(filter: AuditLogFilter, cap: number): Promise<boolean> {
    const { since, until } = this.normaliseRange(filter.since, filter.until);
    const inner = this.dataSource
      .getRepository(AuditLog)
      .createQueryBuilder('a')
      .select('1');
    this.applyBaseFilters(inner, filter, since, until);
    inner.limit(cap + 1);

    // getQueryAndParameters() interpolates the named `:orgId / :q / …`
    // params into positional `$1, $2, …` placeholders + returns a parallel
    // array — required form for `dataSource.query(sql, params)`.
    const [innerSql, innerParams] = inner.getQueryAndParameters();
    const result: Array<{ count: string }> = await this.dataSource.query(
      `SELECT count(*) AS count FROM (${innerSql}) sub`,
      innerParams,
    );
    const total = Number.parseInt(result[0]?.count ?? '0', 10);
    return total > cap;
  }

  /**
   * One cursor-paginated batch. Order: `(created_at DESC, id DESC)`. Cursor
   * predicate uses Postgres row comparison `(a, b) < (x, y)` — supported and
   * index-friendly. When `cursor` is undefined, returns the newest `limit`
   * rows for the filter.
   */
  private async cursorBatch(
    filter: AuditLogFilter,
    cursor: AuditLogStreamCursor | undefined,
    limit: number,
  ): Promise<AuditLog[]> {
    const { since, until } = this.normaliseRange(filter.since, filter.until);
    const repo = this.dataSource.getRepository(AuditLog);
    const qb = repo.createQueryBuilder('a');
    this.applyBaseFilters(qb, filter, since, until);

    if (cursor) {
      qb.andWhere('(a.created_at, a.id) < (:cursorCreatedAt, :cursorId)', {
        cursorCreatedAt: cursor.createdAt,
        cursorId: cursor.id,
      });
    }

    qb.orderBy('a.created_at', 'DESC').addOrderBy('a.id', 'DESC').limit(limit);
    return qb.getMany();
  }

  /**
   * Apply all `AuditLogFilter` predicates to a QueryBuilder (org_id +
   * since/until + optional aggregateType/aggregateId/eventTypes/
   * actorUserId/actorKind/q). Shared by `query()`, `cursorBatch()`, and
   * `wouldExceedCap()` so filter semantics stay identical across the three
   * read paths.
   */
  private applyBaseFilters(
    qb: SelectQueryBuilder<AuditLog>,
    filter: AuditLogFilter,
    since: Date,
    until: Date,
  ): void {
    qb.where('a.organization_id = :orgId', { orgId: filter.organizationId })
      .andWhere('a.created_at >= :since', { since })
      .andWhere('a.created_at <= :until', { until });
    if (filter.aggregateType) {
      qb.andWhere('a.aggregate_type = :aggregateType', {
        aggregateType: filter.aggregateType,
      });
    }
    if (filter.aggregateId) {
      qb.andWhere('a.aggregate_id = :aggregateId', { aggregateId: filter.aggregateId });
    }
    if (filter.eventTypes && filter.eventTypes.length > 0) {
      qb.andWhere(
        new Brackets((sub) => {
          sub.where('a.event_type IN (:...eventTypes)', { eventTypes: filter.eventTypes });
        }),
      );
    }
    if (filter.actorUserId) {
      qb.andWhere('a.actor_user_id = :actorUserId', { actorUserId: filter.actorUserId });
    }
    if (filter.actorKind) {
      qb.andWhere('a.actor_kind = :actorKind', { actorKind: filter.actorKind });
    }
    if (filter.q && filter.q.length > 0) {
      qb.andWhere(
        `(
          (${ES_VECTOR_SQL}) @@ plainto_tsquery('spanish', :q)
          OR
          (${EN_VECTOR_SQL}) @@ plainto_tsquery('english', :q)
        )`,
        { q: filter.q },
      );
    }
  }

  private normaliseLimit(raw: number | undefined): number {
    if (raw === undefined) return AUDIT_LOG_DEFAULT_LIMIT;
    if (!Number.isFinite(raw) || !Number.isInteger(raw)) {
      throw new AuditLogQueryError('limit must be a positive integer', 'LIMIT_OUT_OF_RANGE');
    }
    if (raw < 1 || raw > AUDIT_LOG_MAX_LIMIT) {
      throw new AuditLogQueryError(
        `limit must be in [1, ${AUDIT_LOG_MAX_LIMIT}]`,
        'LIMIT_OUT_OF_RANGE',
      );
    }
    return raw;
  }

  private normaliseOffset(raw: number | undefined): number {
    if (raw === undefined) return 0;
    if (!Number.isFinite(raw) || !Number.isInteger(raw) || raw < 0) {
      throw new AuditLogQueryError('offset must be ≥ 0', 'OFFSET_NEGATIVE');
    }
    return raw;
  }

  private normaliseRange(since?: Date, until?: Date): { since: Date; until: Date } {
    const now = new Date();
    const computedUntil = until ?? now;
    const computedSince = since ?? new Date(computedUntil.getTime() - AUDIT_LOG_DEFAULT_WINDOW_MS);
    if (computedSince.getTime() > computedUntil.getTime()) {
      throw new AuditLogQueryError(
        '`since` must be before `until`',
        'INVALID_DATE_RANGE',
      );
    }
    return { since: computedSince, until: computedUntil };
  }
}
