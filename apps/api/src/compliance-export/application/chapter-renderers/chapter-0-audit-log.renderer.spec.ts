import type { AuditLogService } from '../../../audit-log/application/audit-log.service';
import { ChapterZeroAuditLogRenderer } from './chapter-0-audit-log.renderer';

const ORG = '11111111-1111-4111-8111-111111111111';

function makeRow(overrides: {
  id?: string;
  eventType?: string;
  createdAt?: Date;
  aggregateType?: string;
  aggregateId?: string;
  actorKind?: string;
  payloadAfter?: unknown;
} = {}): {
  id: string;
  organizationId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  actorUserId: string | null;
  actorKind: string;
  agentName: string | null;
  reason: string | null;
  citationUrl: string | null;
  snippet: string | null;
  createdAt: Date;
  retentionClass: string | null;
  payloadBefore: unknown;
  payloadAfter: unknown;
} {
  return {
    id: overrides.id ?? 'r1',
    organizationId: ORG,
    eventType: overrides.eventType ?? 'LOT_CREATED',
    aggregateType: overrides.aggregateType ?? 'lot',
    aggregateId: overrides.aggregateId ?? 'a1',
    actorUserId: null,
    actorKind: overrides.actorKind ?? 'user',
    agentName: null,
    reason: null,
    citationUrl: null,
    snippet: null,
    createdAt: overrides.createdAt ?? new Date('2026-03-01T10:00:00Z'),
    retentionClass: 'regulatory',
    payloadBefore: null,
    payloadAfter: overrides.payloadAfter ?? { value: 1 },
  };
}

async function* yieldRows<T>(rows: T[]): AsyncGenerator<T> {
  for (const r of rows) yield r;
}

describe('ChapterZeroAuditLogRenderer.render', () => {
  it('emits a chronologically-ordered CSV with every column unmodified', async () => {
    const rows = [
      makeRow({
        id: 'b',
        eventType: 'LOT_CREATED',
        createdAt: new Date('2026-03-02T10:00:00Z'),
      }),
      makeRow({
        id: 'a',
        eventType: 'STOCK_MOVE_CREATED',
        createdAt: new Date('2026-03-01T10:00:00Z'),
      }),
    ];
    const auditLog = {
      streamRows: jest.fn(() => yieldRows(rows)),
    } as unknown as AuditLogService;
    const renderer = new ChapterZeroAuditLogRenderer(auditLog);
    const section = await renderer.render(
      ORG,
      new Date('2026-03-01T00:00:00Z'),
      new Date('2026-03-31T23:59:59Z'),
      'es-ES',
    );
    expect(section.rowCount).toBe(2);
    expect(section.csvSection).toContain(
      'id,organization_id,event_type',
    );
    // Lower-id row b comes first by created_at ASC; a is later in clock
    // but earlier in CSV because of the sort step.
    const firstStockMove = section.csvSection.indexOf('STOCK_MOVE_CREATED');
    const firstLotCreated = section.csvSection.indexOf('LOT_CREATED');
    expect(firstStockMove).toBeLessThan(firstLotCreated);
  });

  it('renders the empty-range marker when no rows exist', async () => {
    const auditLog = {
      streamRows: jest.fn(() => yieldRows([])),
    } as unknown as AuditLogService;
    const renderer = new ChapterZeroAuditLogRenderer(auditLog);
    const section = await renderer.render(
      ORG,
      new Date('2026-03-01T00:00:00Z'),
      new Date('2026-03-31T23:59:59Z'),
      'es-ES',
    );
    expect(section.rowCount).toBe(0);
    expect(section.csvSection).toContain('Sin eventos en el rango.');
    expect(section.pdfSection.toString()).toContain('Sin eventos en el rango.');
  });

  it('passes the tenant + range filter through to streamRows()', async () => {
    const streamRows = jest.fn(() => yieldRows([]));
    const auditLog = {
      streamRows,
    } as unknown as AuditLogService;
    const renderer = new ChapterZeroAuditLogRenderer(auditLog);
    const rangeStart = new Date('2026-03-01T00:00:00Z');
    const rangeEnd = new Date('2026-03-31T23:59:59Z');
    await renderer.render(ORG, rangeStart, rangeEnd, 'eu-ES');
    expect(streamRows).toHaveBeenCalledWith({
      organizationId: ORG,
      since: rangeStart,
      until: rangeEnd,
    });
  });
});
