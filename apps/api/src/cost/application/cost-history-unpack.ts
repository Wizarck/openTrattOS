import type { AuditLog } from '../../audit-log/domain/audit-log.entity';
import { isCostChangeReason, type CostChangeReason } from './cost-change-reason';

/**
 * Unpacked shape produced from one `audit_log` row whose `event_type` is
 * `RECIPE_COST_REBUILT`. Each audit row produces N+1 unpacked entries
 * (N components + 1 totals) so the downstream `CostHistoryRowDto` mapper
 * can return rows in the same wire shape `recipe_cost_history` did.
 */
export interface CostHistoryUnpacked {
  /** Synthetic id: `<auditLogRowId>:<componentRefId|'totals'>` — opaque to clients. */
  id: string;
  recipeId: string;
  componentRefId: string | null;
  costPerBaseUnit: number;
  totalCost: number;
  sourceRefId: string | null;
  reason: CostChangeReason;
  computedAt: Date;
}

interface ComponentPayloadEntry {
  recipeIngredientId?: unknown;
  costPerBaseUnit?: unknown;
  totalCost?: unknown;
  sourceRefId?: unknown;
}

interface RebuildPayload {
  reason?: unknown;
  totalCost?: unknown;
  components?: unknown;
  /** Wave 1.9 thin payload only — count of components, no breakdown. */
  componentCount?: unknown;
}

/**
 * Convert one `audit_log` row (RECIPE_COST_REBUILT) to N+1 history-row entries.
 *
 * Two payload shapes are supported:
 *
 * 1. **Rich (Wave 1.10+)** — `payload_after.components` is an array of
 *    `{recipeIngredientId, costPerBaseUnit, totalCost, sourceRefId}`. Produces
 *    1 totals row + N component rows.
 *
 * 2. **Thin (Wave 1.9)** — `payload_after.components` absent or non-array.
 *    Produces 1 totals row only; no component rows. The data gap is logged at
 *    debug level so operators can spot pre-Wave-1.10 events.
 */
export function unpackHistoryRows(audit: AuditLog): CostHistoryUnpacked[] {
  const payload = (audit.payloadAfter ?? {}) as RebuildPayload;
  const reason = isCostChangeReason(payload.reason) ? payload.reason : 'INITIAL';
  const totalCost = toFiniteNumber(payload.totalCost);
  const result: CostHistoryUnpacked[] = [];

  result.push({
    id: `${audit.id}:totals`,
    recipeId: audit.aggregateId,
    componentRefId: null,
    costPerBaseUnit: 0,
    totalCost,
    sourceRefId: null,
    reason,
    computedAt: audit.createdAt,
  });

  if (Array.isArray(payload.components)) {
    for (const raw of payload.components as ComponentPayloadEntry[]) {
      if (!raw || typeof raw !== 'object') continue;
      const componentRefId = typeof raw.recipeIngredientId === 'string' ? raw.recipeIngredientId : null;
      if (!componentRefId) continue;
      result.push({
        id: `${audit.id}:${componentRefId}`,
        recipeId: audit.aggregateId,
        componentRefId,
        costPerBaseUnit: toFiniteNumber(raw.costPerBaseUnit),
        totalCost: toFiniteNumber(raw.totalCost),
        sourceRefId: typeof raw.sourceRefId === 'string' ? raw.sourceRefId : null,
        reason,
        computedAt: audit.createdAt,
      });
    }
  }

  return result;
}

function toFiniteNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

