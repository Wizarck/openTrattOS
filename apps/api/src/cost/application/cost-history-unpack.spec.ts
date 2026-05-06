import { AuditLog } from '../../audit-log/domain/audit-log.entity';
import { unpackHistoryRows } from './cost-history-unpack';

const ORG = '00000000-0000-4000-8000-00000000aaaa';
const REC = '00000000-0000-4000-8000-00000000bbbb';
const LINE_A = '00000000-0000-4000-8000-00000000cccc';
const LINE_B = '00000000-0000-4000-8000-00000000dddd';

function makeAuditRow(overrides: Partial<AuditLog> = {}): AuditLog {
  const row = new AuditLog();
  row.id = overrides.id ?? '00000000-0000-4000-8000-000000000001';
  row.organizationId = overrides.organizationId ?? ORG;
  row.eventType = 'RECIPE_COST_REBUILT';
  row.aggregateType = 'recipe';
  row.aggregateId = overrides.aggregateId ?? REC;
  row.actorUserId = null;
  row.actorKind = 'system';
  row.agentName = null;
  row.payloadBefore = null;
  row.payloadAfter = overrides.payloadAfter ?? null;
  row.reason = null;
  row.citationUrl = null;
  row.snippet = null;
  row.createdAt = overrides.createdAt ?? new Date('2026-05-06T11:42:08Z');
  return row;
}

describe('unpackHistoryRows', () => {
  it('expands rich payload into 1 totals + N component rows', () => {
    const audit = makeAuditRow({
      payloadAfter: {
        reason: 'INITIAL',
        totalCost: 12.5,
        components: [
          {
            recipeIngredientId: LINE_A,
            costPerBaseUnit: 0.005,
            totalCost: 5,
            sourceRefId: 'src-a',
          },
          {
            recipeIngredientId: LINE_B,
            costPerBaseUnit: 0.01,
            totalCost: 7.5,
            sourceRefId: null,
          },
        ],
      },
    });

    const rows = unpackHistoryRows(audit);

    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      id: `${audit.id}:totals`,
      componentRefId: null,
      totalCost: 12.5,
      reason: 'INITIAL',
    });
    expect(rows[1]).toMatchObject({
      id: `${audit.id}:${LINE_A}`,
      componentRefId: LINE_A,
      costPerBaseUnit: 0.005,
      totalCost: 5,
      sourceRefId: 'src-a',
    });
    expect(rows[2]).toMatchObject({
      id: `${audit.id}:${LINE_B}`,
      componentRefId: LINE_B,
      sourceRefId: null,
    });
  });

  it('handles thin Wave 1.9 payload (no components array) → 1 totals row only', () => {
    const audit = makeAuditRow({
      payloadAfter: {
        reason: 'SUPPLIER_PRICE_CHANGE',
        totalCost: 8.25,
        componentCount: 4,
      },
    });
    const rows = unpackHistoryRows(audit);
    expect(rows).toHaveLength(1);
    expect(rows[0].componentRefId).toBeNull();
    expect(rows[0].totalCost).toBe(8.25);
    expect(rows[0].reason).toBe('SUPPLIER_PRICE_CHANGE');
  });

  it('falls back to INITIAL when payload reason is missing', () => {
    const audit = makeAuditRow({
      payloadAfter: { totalCost: 1, components: [] },
    });
    const rows = unpackHistoryRows(audit);
    expect(rows[0].reason).toBe('INITIAL');
  });

  it('falls back to INITIAL when reason is not a known enum', () => {
    const audit = makeAuditRow({
      payloadAfter: { reason: 'SOME_FUTURE_REASON', totalCost: 0, components: [] },
    });
    const rows = unpackHistoryRows(audit);
    expect(rows[0].reason).toBe('INITIAL');
  });

  it('coerces numeric strings to finite numbers', () => {
    const audit = makeAuditRow({
      payloadAfter: {
        reason: 'INITIAL',
        totalCost: '4.25',
        components: [
          {
            recipeIngredientId: LINE_A,
            costPerBaseUnit: '0.0033',
            totalCost: '4.25',
            sourceRefId: null,
          },
        ],
      },
    });
    const rows = unpackHistoryRows(audit);
    expect(rows[0].totalCost).toBe(4.25);
    expect(rows[1].costPerBaseUnit).toBe(0.0033);
    expect(rows[1].totalCost).toBe(4.25);
  });

  it('skips components missing recipeIngredientId', () => {
    const audit = makeAuditRow({
      payloadAfter: {
        reason: 'INITIAL',
        totalCost: 0,
        components: [
          {
            recipeIngredientId: null,
            costPerBaseUnit: 1,
            totalCost: 1,
            sourceRefId: null,
          },
          {
            recipeIngredientId: LINE_A,
            costPerBaseUnit: 0,
            totalCost: 0,
            sourceRefId: null,
          },
        ],
      },
    });
    const rows = unpackHistoryRows(audit);
    // 1 totals + 1 valid component
    expect(rows).toHaveLength(2);
    expect(rows[1].componentRefId).toBe(LINE_A);
  });

  it('handles empty components array → 1 totals row, 0 components', () => {
    const audit = makeAuditRow({
      payloadAfter: { reason: 'INITIAL', totalCost: 0, components: [] },
    });
    const rows = unpackHistoryRows(audit);
    expect(rows).toHaveLength(1);
  });

  it('handles null payloadAfter defensively', () => {
    const audit = makeAuditRow({ payloadAfter: null });
    const rows = unpackHistoryRows(audit);
    expect(rows).toHaveLength(1);
    expect(rows[0].totalCost).toBe(0);
    expect(rows[0].reason).toBe('INITIAL');
  });
});
