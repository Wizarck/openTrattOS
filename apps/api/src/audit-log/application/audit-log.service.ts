import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Brackets, DataSource } from 'typeorm';
import { AuditLog } from '../domain/audit-log.entity';
import { AuditLogQueryError } from './errors';
import {
  AuditEventEnvelope,
  AuditLogFilter,
  AuditLogPage,
} from './types';

export const AUDIT_LOG_DEFAULT_LIMIT = 50;
export const AUDIT_LOG_MAX_LIMIT = 200;
export const AUDIT_LOG_DEFAULT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

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
   * to [1, 200]. Returns `{ rows, total, limit, offset }`.
   */
  async query(filter: AuditLogFilter): Promise<AuditLogPage<AuditLog>> {
    const limit = this.normaliseLimit(filter.limit);
    const offset = this.normaliseOffset(filter.offset);
    const { since, until } = this.normaliseRange(filter.since, filter.until);

    const repo = this.dataSource.getRepository(AuditLog);
    const qb = repo
      .createQueryBuilder('a')
      .where('a.organization_id = :orgId', { orgId: filter.organizationId })
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

    qb.orderBy('a.created_at', 'DESC').skip(offset).take(limit);

    const [rows, total] = await qb.getManyAndCount();
    return { rows, total, limit, offset };
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
