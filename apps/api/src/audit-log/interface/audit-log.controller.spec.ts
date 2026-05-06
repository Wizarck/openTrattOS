import { UnprocessableEntityException } from '@nestjs/common';
import { AuditLogQueryError } from '../application/errors';
import { AuditLog } from '../domain/audit-log.entity';
import { AuditLogController } from './audit-log.controller';
import type { AuditLogQueryDto } from './dto/audit-log-query.dto';

const ORG = '11111111-1111-4111-8111-111111111111';

function makeAuditLog(overrides: Partial<AuditLog> = {}): AuditLog {
  const row = new AuditLog();
  row.id = overrides.id ?? '00000000-0000-4000-8000-000000000001';
  row.organizationId = overrides.organizationId ?? ORG;
  row.eventType = overrides.eventType ?? 'AI_SUGGESTION_ACCEPTED';
  row.aggregateType = overrides.aggregateType ?? 'ai_suggestion';
  row.aggregateId = overrides.aggregateId ?? '00000000-0000-4000-8000-00000000bbbb';
  row.actorUserId = overrides.actorUserId ?? null;
  row.actorKind = overrides.actorKind ?? 'user';
  row.agentName = overrides.agentName ?? null;
  row.payloadBefore = overrides.payloadBefore ?? null;
  row.payloadAfter = overrides.payloadAfter ?? null;
  row.reason = overrides.reason ?? null;
  row.citationUrl = overrides.citationUrl ?? null;
  row.snippet = overrides.snippet ?? null;
  row.createdAt = overrides.createdAt ?? new Date('2026-05-06T11:42:08Z');
  return row;
}

function makeQuery(overrides: Partial<AuditLogQueryDto> = {}): AuditLogQueryDto {
  return {
    organizationId: ORG,
    ...overrides,
  } as AuditLogQueryDto;
}

describe('AuditLogController', () => {
  let controller: AuditLogController;
  let queryMock: jest.Mock;

  beforeEach(() => {
    queryMock = jest.fn();
    const auditLog = { query: queryMock } as unknown as Parameters<
      typeof AuditLogController.prototype.query
    >[0] extends never
      ? unknown
      : unknown;
    controller = new AuditLogController(auditLog as never);
  });

  it('returns mapped page on happy path', async () => {
    queryMock.mockResolvedValue({
      rows: [makeAuditLog()],
      total: 1,
      limit: 50,
      offset: 0,
    });
    const result = await controller.query(makeQuery());
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(result.total).toBe(1);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].createdAt).toBe('2026-05-06T11:42:08.000Z');
    expect(result.rows[0].eventType).toBe('AI_SUGGESTION_ACCEPTED');
  });

  it('passes filter through to service', async () => {
    queryMock.mockResolvedValue({ rows: [], total: 0, limit: 50, offset: 0 });
    await controller.query(
      makeQuery({
        aggregateType: 'recipe',
        aggregateId: '00000000-0000-4000-8000-00000000bbbb',
        eventType: ['AI_SUGGESTION_ACCEPTED', 'AI_SUGGESTION_REJECTED'],
        actorKind: 'user',
        limit: 25,
        offset: 10,
      }),
    );
    const callArg = queryMock.mock.calls[0][0];
    expect(callArg.aggregateType).toBe('recipe');
    expect(callArg.eventTypes).toEqual([
      'AI_SUGGESTION_ACCEPTED',
      'AI_SUGGESTION_REJECTED',
    ]);
    expect(callArg.actorKind).toBe('user');
    expect(callArg.limit).toBe(25);
    expect(callArg.offset).toBe(10);
  });

  it('translates AuditLogQueryError to 422', async () => {
    queryMock.mockRejectedValue(
      new AuditLogQueryError('limit out of range', 'LIMIT_OUT_OF_RANGE'),
    );
    await expect(controller.query(makeQuery())).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('rethrows non-query errors unchanged', async () => {
    queryMock.mockRejectedValue(new Error('db gone'));
    await expect(controller.query(makeQuery())).rejects.toThrow('db gone');
  });

  it('exposes nullable fields as nulls in DTO', async () => {
    queryMock.mockResolvedValue({
      rows: [
        makeAuditLog({
          actorUserId: null,
          agentName: null,
          payloadBefore: null,
          payloadAfter: { foo: 'bar' },
          reason: null,
          citationUrl: 'https://x',
          snippet: 'y',
        }),
      ],
      total: 1,
      limit: 50,
      offset: 0,
    });
    const result = await controller.query(makeQuery());
    const row = result.rows[0];
    expect(row.actorUserId).toBeNull();
    expect(row.agentName).toBeNull();
    expect(row.payloadBefore).toBeNull();
    expect(row.payloadAfter).toEqual({ foo: 'bar' });
    expect(row.reason).toBeNull();
    expect(row.citationUrl).toBe('https://x');
    expect(row.snippet).toBe('y');
  });
});
