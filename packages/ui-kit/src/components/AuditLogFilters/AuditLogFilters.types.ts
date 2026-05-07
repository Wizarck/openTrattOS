export const KNOWN_AUDIT_EVENT_TYPES = [
  'AGENT_ACTION_EXECUTED',
  'AGENT_ACTION_FORENSIC',
  'INGREDIENT_OVERRIDE_CHANGED',
  'RECIPE_ALLERGENS_OVERRIDE_CHANGED',
  'RECIPE_SOURCE_OVERRIDE_CHANGED',
  'RECIPE_INGREDIENT_UPDATED',
  'SUPPLIER_PRICE_UPDATED',
  'RECIPE_COST_REBUILT',
  'AI_SUGGESTION_ACCEPTED',
  'AI_SUGGESTION_REJECTED',
] as const;
export type KnownAuditEventType = (typeof KNOWN_AUDIT_EVENT_TYPES)[number];

export const KNOWN_AUDIT_AGGREGATE_TYPES = [
  'recipe',
  'menu_item',
  'ingredient',
  'supplier_item',
  'agent_credential',
  'organization',
  'ai_suggestion',
  'agent_chat_session',
] as const;
export type KnownAuditAggregateType = (typeof KNOWN_AUDIT_AGGREGATE_TYPES)[number];

export const AUDIT_ACTOR_KINDS = ['user', 'agent', 'system'] as const;
export type AuditActorKind = (typeof AUDIT_ACTOR_KINDS)[number];

export interface AuditLogFilterValues {
  /** Selected event types (multi-select). Empty array = no filter. */
  eventType: string[];
  aggregateType: string | null;
  actorKind: AuditActorKind | null;
  /** ISO date YYYY-MM-DD; null = no filter. */
  since: string | null;
  until: string | null;
  /** FTS query; empty string = no filter. */
  q: string;
}

export interface AuditLogFiltersProps {
  values: AuditLogFilterValues;
  onChange: (values: AuditLogFilterValues) => void;
  onApply: () => void;
  onReset: () => void;
  onExportCsv: () => void;
  applying?: boolean;
}

/**
 * The shape of a "default filter" — Wave 1.9 picked last-30d as the
 * implicit window. The screen sets `since`/`until` on initial mount;
 * Reset returns the form to this empty shape and the screen reapplies
 * the 30d window.
 */
export const EMPTY_AUDIT_FILTER_VALUES: AuditLogFilterValues = {
  eventType: [],
  aggregateType: null,
  actorKind: null,
  since: null,
  until: null,
  q: '',
};
