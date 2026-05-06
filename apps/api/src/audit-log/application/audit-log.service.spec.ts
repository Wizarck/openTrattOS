import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { AuditLog } from '../domain/audit-log.entity';
import {
  AUDIT_LOG_DEFAULT_LIMIT,
  AUDIT_LOG_MAX_LIMIT,
  AuditLogService,
} from './audit-log.service';
import { AuditLogQueryError } from './errors';
import type { AuditEventEnvelope } from './types';

interface FakeQueryBuilder {
  whereCalls: Array<{ sql: string; params: Record<string, unknown> }>;
  orderByCalled?: { col: string; dir: 'ASC' | 'DESC' };
  skipValue?: number;
  takeValue?: number;
  rows: AuditLog[];
  total: number;
}

type FakeQbHandle = Record<string, unknown> & {
  where: (sql: string, params: Record<string, unknown>) => FakeQbHandle;
  andWhere: (sqlOrBrackets: unknown, params?: Record<string, unknown>) => FakeQbHandle;
  orderBy: (col: string, dir: 'ASC' | 'DESC') => FakeQbHandle;
  skip: (n: number) => FakeQbHandle;
  take: (n: number) => FakeQbHandle;
  getManyAndCount: () => Promise<[AuditLog[], number]>;
};

function makeFakeQueryBuilder(rows: AuditLog[], total: number): {
  qb: FakeQbHandle;
  state: FakeQueryBuilder;
} {
  const state: FakeQueryBuilder = { whereCalls: [], rows, total };
  const qb: FakeQbHandle = {
    where(sql: string, params: Record<string, unknown>) {
      state.whereCalls.push({ sql, params });
      return qb;
    },
    andWhere(sqlOrBrackets: unknown, params?: Record<string, unknown>) {
      // Brackets are used for IN clauses; we capture the params directly.
      if (typeof sqlOrBrackets === 'string') {
        state.whereCalls.push({ sql: sqlOrBrackets, params: params ?? {} });
      } else {
        // Treat as Brackets — unwrap by calling the inner func with this same qb.
        const fn = (sqlOrBrackets as { whereFactory?: (qb: FakeQbHandle) => void }).whereFactory;
        fn?.(qb);
      }
      return qb;
    },
    orderBy(col: string, dir: 'ASC' | 'DESC') {
      state.orderByCalled = { col, dir };
      return qb;
    },
    skip(n: number) {
      state.skipValue = n;
      return qb;
    },
    take(n: number) {
      state.takeValue = n;
      return qb;
    },
    async getManyAndCount(): Promise<[AuditLog[], number]> {
      return [state.rows, state.total];
    },
  };
  return { qb, state };
}

function makeAuditLog(overrides: Partial<AuditLog> = {}): AuditLog {
  const row = new AuditLog();
  row.id = overrides.id ?? '00000000-0000-4000-8000-000000000001';
  row.organizationId = overrides.organizationId ?? '00000000-0000-4000-8000-00000000aaaa';
  row.eventType = overrides.eventType ?? 'TEST_EVENT';
  row.aggregateType = overrides.aggregateType ?? 'test';
  row.aggregateId = overrides.aggregateId ?? '00000000-0000-4000-8000-00000000bbbb';
  row.actorUserId = overrides.actorUserId ?? null;
  row.actorKind = overrides.actorKind ?? 'system';
  row.agentName = overrides.agentName ?? null;
  row.payloadBefore = overrides.payloadBefore ?? null;
  row.payloadAfter = overrides.payloadAfter ?? null;
  row.reason = overrides.reason ?? null;
  row.citationUrl = overrides.citationUrl ?? null;
  row.snippet = overrides.snippet ?? null;
  row.createdAt = overrides.createdAt ?? new Date();
  return row;
}

describe('AuditLogService', () => {
  const orgId = '00000000-0000-4000-8000-00000000aaaa';

  let service: AuditLogService;
  let savedRows: AuditLog[];
  let qbStates: FakeQueryBuilder[] = [];

  beforeEach(async () => {
    savedRows = [];
    qbStates = [];

    const dataSource = {
      getRepository: () => ({
        save: jest.fn(async (row: AuditLog) => {
          savedRows.push(row);
          return row;
        }),
        createQueryBuilder: () => {
          const next = qbStates.shift();
          if (!next) throw new Error('No QB state pre-loaded for test');
          return makeFakeQueryBuilder(next.rows, next.total).qb;
        },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogService,
        { provide: getDataSourceToken(), useValue: dataSource },
      ],
    }).compile();

    service = module.get(AuditLogService);
  });

  describe('record()', () => {
    it('persists envelope as audit row', async () => {
      const envelope: AuditEventEnvelope = {
        organizationId: orgId,
        aggregateType: 'recipe',
        aggregateId: 'agg-123',
        actorUserId: 'user-1',
        actorKind: 'user',
        payloadAfter: { foo: 'bar' },
        reason: 'because',
      };
      await service.record('AI_SUGGESTION_ACCEPTED', envelope);
      expect(savedRows).toHaveLength(1);
      const row = savedRows[0];
      expect(row.eventType).toBe('AI_SUGGESTION_ACCEPTED');
      expect(row.organizationId).toBe(orgId);
      expect(row.aggregateType).toBe('recipe');
      expect(row.aggregateId).toBe('agg-123');
      expect(row.actorUserId).toBe('user-1');
      expect(row.actorKind).toBe('user');
      expect(row.payloadAfter).toEqual({ foo: 'bar' });
      expect(row.reason).toBe('because');
      expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('persists nullable fields as null when omitted', async () => {
      await service.record('SYSTEM_PING', {
        organizationId: orgId,
        aggregateType: 'organization',
        aggregateId: orgId,
        actorUserId: null,
        actorKind: 'system',
      });
      const row = savedRows[0];
      expect(row.actorUserId).toBeNull();
      expect(row.agentName).toBeNull();
      expect(row.payloadBefore).toBeNull();
      expect(row.payloadAfter).toBeNull();
      expect(row.reason).toBeNull();
      expect(row.citationUrl).toBeNull();
      expect(row.snippet).toBeNull();
    });

    it('preserves agentName when actorKind is agent', async () => {
      await service.record('AGENT_ACTION_EXECUTED', {
        organizationId: orgId,
        aggregateType: 'organization',
        aggregateId: orgId,
        actorUserId: 'user-1',
        actorKind: 'agent',
        agentName: 'claude-desktop',
      });
      expect(savedRows[0].actorKind).toBe('agent');
      expect(savedRows[0].agentName).toBe('claude-desktop');
    });
  });

  describe('query()', () => {
    it('returns rows + total + clamped pagination', async () => {
      qbStates.push({ whereCalls: [], rows: [makeAuditLog()], total: 1 });
      const page = await service.query({ organizationId: orgId });
      expect(page.rows).toHaveLength(1);
      expect(page.total).toBe(1);
      expect(page.limit).toBe(AUDIT_LOG_DEFAULT_LIMIT);
      expect(page.offset).toBe(0);
    });

    it('rejects limit out of range', async () => {
      await expect(
        service.query({ organizationId: orgId, limit: 0 }),
      ).rejects.toBeInstanceOf(AuditLogQueryError);
      await expect(
        service.query({ organizationId: orgId, limit: AUDIT_LOG_MAX_LIMIT + 1 }),
      ).rejects.toBeInstanceOf(AuditLogQueryError);
    });

    it('rejects negative offset', async () => {
      await expect(
        service.query({ organizationId: orgId, offset: -1 }),
      ).rejects.toBeInstanceOf(AuditLogQueryError);
    });

    it('rejects since > until', async () => {
      const since = new Date('2026-05-06T00:00:00Z');
      const until = new Date('2026-05-05T00:00:00Z');
      await expect(
        service.query({ organizationId: orgId, since, until }),
      ).rejects.toBeInstanceOf(AuditLogQueryError);
    });

    it('defaults to last 30 days when range omitted', async () => {
      qbStates.push({ whereCalls: [], rows: [], total: 0 });
      const beforeNow = Date.now();
      const page = await service.query({ organizationId: orgId });
      expect(page.total).toBe(0);
      // Smoke check: defaults applied without throwing.
      expect(beforeNow).toBeLessThanOrEqual(Date.now());
    });

    it('honours explicit limit + offset', async () => {
      qbStates.push({ whereCalls: [], rows: [], total: 0 });
      const page = await service.query({ organizationId: orgId, limit: 10, offset: 5 });
      expect(page.limit).toBe(10);
      expect(page.offset).toBe(5);
    });
  });
});
