import type { AuditActorKind } from '../domain/audit-log.entity.js';

/**
 * Canonical event-type constants. The values match the existing channel names
 * already in use across the bus (defined in `cost/application/cost.events.ts`)
 * so the AuditLogSubscriber listens on the same channels existing subscribers
 * (cost.service rollup rebuild, labels.service cache invalidation,
 * dashboard.service cache invalidation) already use. New events introduced by
 * THIS slice (ai-suggestion accept/reject + recipe cost rebuilt) follow a
 * `<bc>.<verb>` convention.
 *
 * The set is open — adding a new event in M3+ is one constant + one
 * `@OnEvent` handler in `AuditLogSubscriber`. The DB column is
 * `text NOT NULL CHECK (length 1..100)` rather than an enum, so extending the
 * set requires no migration.
 */
export const AuditEventType = {
  AI_SUGGESTION_ACCEPTED: 'ai-suggestions.accepted',
  AI_SUGGESTION_REJECTED: 'ai-suggestions.rejected',
  INGREDIENT_OVERRIDE_CHANGED: 'cost.ingredient-override-changed',
  RECIPE_ALLERGENS_OVERRIDE_CHANGED: 'cost.recipe-allergens-override-changed',
  RECIPE_SOURCE_OVERRIDE_CHANGED: 'cost.recipe-source-override-changed',
  RECIPE_INGREDIENT_UPDATED: 'cost.recipe-ingredient-updated',
  RECIPE_COST_REBUILT: 'cost.recipe-cost-rebuilt',
  SUPPLIER_PRICE_UPDATED: 'cost.supplier-price-updated',
  AGENT_ACTION_EXECUTED: 'agent.action-executed',
} as const;

/**
 * The audit log canonicalises each event-type channel into a stable, public
 * `event_type` string stored on the audit row. Persisting the bus channel name
 * directly would leak module structure (e.g. `cost.ingredient-override-changed`
 * implies the cost module owns ingredient overrides, which is incorrect).
 * The persisted name lives in `AuditEventTypeName`.
 */
export const AuditEventTypeName: Record<AuditEventType, string> = {
  'ai-suggestions.accepted': 'AI_SUGGESTION_ACCEPTED',
  'ai-suggestions.rejected': 'AI_SUGGESTION_REJECTED',
  'cost.ingredient-override-changed': 'INGREDIENT_OVERRIDE_CHANGED',
  'cost.recipe-allergens-override-changed': 'RECIPE_ALLERGENS_OVERRIDE_CHANGED',
  'cost.recipe-source-override-changed': 'RECIPE_SOURCE_OVERRIDE_CHANGED',
  'cost.recipe-ingredient-updated': 'RECIPE_INGREDIENT_UPDATED',
  'cost.recipe-cost-rebuilt': 'RECIPE_COST_REBUILT',
  'cost.supplier-price-updated': 'SUPPLIER_PRICE_UPDATED',
  'agent.action-executed': 'AGENT_ACTION_EXECUTED',
};

export type AuditEventType = (typeof AuditEventType)[keyof typeof AuditEventType];

/** All known audit event-type strings (for validation + iteration in tests). */
export const AUDIT_EVENT_TYPES = Object.values(AuditEventType);

/**
 * Typed envelope for emitting auditable events. Bounded contexts publish this
 * shape on `EventEmitter2` under one of `AuditEventType.*`. The subscriber
 * maps it to an `audit_log` row without per-event-type translation logic.
 */
export interface AuditEventEnvelope<TBefore = unknown, TAfter = unknown> {
  organizationId: string;
  aggregateType: string;
  aggregateId: string;
  actorUserId: string | null;
  actorKind: AuditActorKind;
  agentName?: string;
  payloadBefore?: TBefore | null;
  payloadAfter?: TAfter | null;
  reason?: string;
  citationUrl?: string;
  snippet?: string;
}

/** Filter shape consumed by `AuditLogService.query`. */
export interface AuditLogFilter {
  organizationId: string;
  aggregateType?: string;
  aggregateId?: string;
  eventTypes?: string[];
  actorUserId?: string;
  actorKind?: AuditActorKind;
  since?: Date;
  until?: Date;
  limit?: number;
  offset?: number;
  /**
   * Optional full-text search term. When set, `query()` adds an OR'd
   * dual-config (Spanish + English) WHERE clause backed by the
   * `ix_audit_log_fts_es` + `ix_audit_log_fts_en` GIN indexes, and replaces
   * the default `created_at DESC` ordering with
   * `GREATEST(ts_rank_es, ts_rank_en) DESC, created_at DESC`. Length is
   * enforced at the DTO (≤200 chars).
   */
  q?: string;
}

export interface AuditLogPage<T> {
  rows: T[];
  total: number;
  limit: number;
  offset: number;
}
