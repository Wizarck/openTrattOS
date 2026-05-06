import { StreamableFile, UnprocessableEntityException } from '@nestjs/common';
import type { Response } from 'express';
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
  let streamRowsMock: jest.Mock;
  let wouldExceedCapMock: jest.Mock;

  beforeEach(() => {
    queryMock = jest.fn();
    streamRowsMock = jest.fn();
    wouldExceedCapMock = jest.fn();
    const auditLog = {
      query: queryMock,
      streamRows: streamRowsMock,
      wouldExceedCap: wouldExceedCapMock,
    };
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

  it('passes q (FTS term) through to service filter', async () => {
    queryMock.mockResolvedValue({ rows: [], total: 0, limit: 50, offset: 0 });
    await controller.query(makeQuery({ q: 'tomate' }));
    const callArg = queryMock.mock.calls[0][0];
    expect(callArg.q).toBe('tomate');
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

  describe('exportCsv()', () => {
    function makeFakeResponse(): Response & {
      _headers: Record<string, string>;
    } {
      const headers: Record<string, string> = {};
      return {
        setHeader: jest.fn((name: string, value: string) => {
          headers[name.toLowerCase()] = value;
        }),
        _headers: headers,
      } as unknown as Response & { _headers: Record<string, string> };
    }

    async function* emptyAsyncGen(): AsyncGenerator<AuditLog> {
      // intentionally empty
    }

    async function consumeStream(file: StreamableFile): Promise<string> {
      const stream = file.getStream();
      const chunks: Buffer[] = [];
      for await (const chunk of stream as AsyncIterable<Buffer | string>) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      }
      return Buffer.concat(chunks).toString('utf8');
    }

    it('sets text/csv content-type + dated attachment filename', async () => {
      wouldExceedCapMock.mockResolvedValue(false);
      streamRowsMock.mockReturnValue(emptyAsyncGen());
      const res = makeFakeResponse();
      const file = await controller.exportCsv(makeQuery(), res);
      expect(file).toBeInstanceOf(StreamableFile);
      expect(res._headers['content-type']).toBe('text/csv; charset=utf-8');
      const today = new Date().toISOString().slice(0, 10);
      expect(res._headers['content-disposition']).toBe(
        `attachment; filename="audit-log-${today}.csv"`,
      );
      expect(res._headers['x-audit-log-export-truncated']).toBeUndefined();
    });

    it('sets X-Audit-Log-Export-Truncated header when wouldExceedCap returns true', async () => {
      wouldExceedCapMock.mockResolvedValue(true);
      streamRowsMock.mockReturnValue(emptyAsyncGen());
      const res = makeFakeResponse();
      await controller.exportCsv(makeQuery(), res);
      expect(res._headers['x-audit-log-export-truncated']).toBe('true');
    });

    it('emits CSV header + serialised rows in the body', async () => {
      wouldExceedCapMock.mockResolvedValue(false);
      const seedRows = [
        makeAuditLog({
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          eventType: 'TEST_X',
          reason: 'r1',
        }),
        makeAuditLog({
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          eventType: 'TEST_Y',
          reason: 'r2',
        }),
      ];
      streamRowsMock.mockImplementation(async function* () {
        for (const row of seedRows) yield row;
      });
      const res = makeFakeResponse();
      const file = await controller.exportCsv(makeQuery(), res);
      const body = await consumeStream(file);
      const lines = body.split('\n').filter((l) => l.length > 0);
      expect(lines).toHaveLength(3); // header + 2 data rows
      expect(lines[0]).toContain('id,organizationId,eventType');
      expect(lines[1]).toContain('TEST_X');
      expect(lines[1]).toContain('r1');
      expect(lines[2]).toContain('TEST_Y');
      expect(lines[2]).toContain('r2');
    });

    it('passes filter through to wouldExceedCap and streamRows', async () => {
      wouldExceedCapMock.mockResolvedValue(false);
      streamRowsMock.mockReturnValue(emptyAsyncGen());
      const res = makeFakeResponse();
      await controller.exportCsv(
        makeQuery({
          q: 'tomate',
          aggregateType: 'recipe',
          actorKind: 'user',
        }),
        res,
      );
      // Wait microtask flush so the generator's first awaited call lands.
      await new Promise((r) => setImmediate(r));
      expect(wouldExceedCapMock).toHaveBeenCalledTimes(1);
      const cwArg = wouldExceedCapMock.mock.calls[0][0];
      expect(cwArg.q).toBe('tomate');
      expect(cwArg.aggregateType).toBe('recipe');
      expect(cwArg.actorKind).toBe('user');
    });

    it('translates AuditLogQueryError from wouldExceedCap to 422', async () => {
      wouldExceedCapMock.mockRejectedValue(
        new AuditLogQueryError('bad range', 'INVALID_DATE_RANGE'),
      );
      const res = makeFakeResponse();
      await expect(controller.exportCsv(makeQuery(), res)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });
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
