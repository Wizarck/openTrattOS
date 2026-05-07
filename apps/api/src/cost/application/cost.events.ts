/**
 * Domain events emitted to drive cost recompute + history append. Anyone who
 * mutates a cost-affecting field (SupplierItem price, RecipeIngredient line,
 * sub-recipe composition, override) MUST emit one of these.
 */

export const SUPPLIER_PRICE_UPDATED = 'cost.supplier-price-updated';
export const RECIPE_INGREDIENT_UPDATED = 'cost.recipe-ingredient-updated';
export const RECIPE_SOURCE_OVERRIDE_CHANGED = 'cost.recipe-source-override-changed';
export const SUB_RECIPE_COST_CHANGED = 'cost.sub-recipe-cost-changed';

/**
 * Emitted by RecipesAllergensService whenever the override / cross-contamination
 * state on a Recipe changes (allergen override, diet-flag override, or
 * cross-contamination note). Listeners (e.g. cost-history, label rendering) may
 * react to recompute or invalidate caches; the cost subsystem currently has no
 * handler for this event but the channel is reserved here so additions don't
 * fan out to a new file.
 */
export const RECIPE_ALLERGENS_OVERRIDE_CHANGED = 'cost.recipe-allergens-override-changed';

export interface SupplierPriceUpdatedEvent {
  supplierItemId: string;
  ingredientId: string;
  organizationId: string;
}

export interface RecipeIngredientUpdatedEvent {
  recipeId: string;
  organizationId: string;
  recipeIngredientId: string;
}

export interface RecipeSourceOverrideChangedEvent {
  recipeId: string;
  organizationId: string;
  recipeIngredientId: string;
  sourceOverrideRef: string | null;
}

export interface SubRecipeCostChangedEvent {
  /** The sub-recipe whose cost just shifted; the listener walks parents. */
  subRecipeId: string;
  organizationId: string;
}

/**
 * Payload for `RECIPE_ALLERGENS_OVERRIDE_CHANGED`. `kind` lets a listener
 * route on what actually changed; the event itself is fire-and-forget — the
 * authoritative source of truth is always the Recipe row.
 */
export interface RecipeAllergensOverrideChangedEvent {
  recipeId: string;
  organizationId: string;
  kind: 'allergens-override' | 'diet-flags-override' | 'cross-contamination';
  /** UUID of the Manager+ actor who applied the change. */
  appliedBy: string;
}

/**
 * Emitted by IngredientsService whenever a Manager+ override is applied to
 * an Ingredient field (allergens / dietFlags / nutrition / brandName) per
 * `m2-ingredients-extension`. Reserved channel; the future audit-log listener
 * will subscribe when audit_log lands.
 */
export const INGREDIENT_OVERRIDE_CHANGED = 'cost.ingredient-override-changed';

export interface IngredientOverrideChangedEvent {
  ingredientId: string;
  organizationId: string;
  field: 'allergens' | 'dietFlags' | 'nutrition' | 'brandName';
  /** UUID of the Manager+ actor who applied the change. */
  appliedBy: string;
  /** Auditable reason; mirrors the override entry's `reason`. */
  reason: string;
}

/**
 * Emitted by `AgentAuditMiddleware` whenever an HTTP request carries the
 * `X-Via-Agent` + `X-Agent-Name` headers (i.e. the action was routed via the
 * MCP layer per ADR-013 / m2-mcp-server). The channel is reserved here so a
 * future audit-log listener can subscribe without further fan-out — the
 * `audit_log` table itself does NOT exist yet and is tracked as M2 tech debt.
 *
 * Naming note: this event lives in the cost-events file because the cost
 * subsystem is the only existing event-bus consumer in M2. When the audit_log
 * subsystem lands, the constant should migrate to its own module; consumers
 * that import the constant by name will keep working.
 */
export const AGENT_ACTION_EXECUTED = 'agent.action-executed';

/**
 * Payload for `AGENT_ACTION_EXECUTED`. Carries everything a future audit-log
 * listener would need to write a row without re-reading the request:
 * - `executedBy`: the human user (JWT subject) responsible per the hybrid
 *   identity model. May be `null` when the request is unauthenticated (e.g.
 *   pre-auth probe with agent headers — middleware still records the
 *   attempt for forensics).
 * - `viaAgent`: always `true`; reserved field so the future audit row can
 *   distinguish UI vs agent-mediated actions on a single boolean.
 * - `agentName`: free-text identifier from `X-Agent-Name` (e.g.
 *   `claude-desktop`, `hermes`, `opencode`).
 * - `capabilityName`: optional MCP capability descriptor (e.g.
 *   `recipes.read`); read from `X-Agent-Capability` when present.
 * - `organizationId`: tenant scope; `null` when JWT did not resolve.
 * - `timestamp`: ISO-8601 string captured at middleware entry.
 */
export interface AgentActionExecutedEvent {
  executedBy: string | null;
  viaAgent: true;
  agentName: string;
  capabilityName: string | null;
  organizationId: string | null;
  timestamp: string;
}

/**
 * Emitted by `BeforeAfterAuditInterceptor` (Wave 1.13 [3a]) for every
 * agent-flagged write RPC and by `AgentChatService` (Wave 1.13 [3b]) from
 * the SSE Observable's terminal callback for every chat turn. Carries the
 * canonical `AuditEventEnvelope` shape with `aggregate_type` ≠ 'organization'
 * and `payload_before`/`payload_after` populated.
 *
 * Per ADR-026 (Wave 1.14 `m2-audit-log-forensic-split`), this channel
 * separates the rich, aggregate-anchored mutation row from the lean,
 * request-anchored attribution row carried by `AGENT_ACTION_EXECUTED`. The
 * subscriber persists envelopes as-is via `persistEnvelope()` — no per-type
 * translation. Compile-time clarity replaced the runtime `isRichAuditEnvelope`
 * discrimination that originally co-tenanted both shapes on
 * `AGENT_ACTION_EXECUTED`.
 */
export const AGENT_ACTION_FORENSIC = 'agent.action-forensic';
