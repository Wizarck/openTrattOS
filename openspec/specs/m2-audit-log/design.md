## Context

Five M2 BCs already implement a cache+audit pattern in their per-BC tables:

- `recipe_cost_history` (Wave `m2-cost-rollup-and-audit`, #75) — append-only audit row per cost rollup.
- `ingredients.overrides` jsonb column (Wave `m2-ingredients-extension`, #84) — single-row history of overrides; events emitted but not persisted.
- `recipes.allergens_overrides` jsonb (Wave `m2-allergens-article-21`, #80) — same pattern.
- `ai_suggestions` (Wave `m2-ai-yield-suggestions`, #87) — `status` flip from pending → accepted/rejected IS the audit record. Single unified table.
- `mcp-server` middleware (Wave `m2-mcp-server`, #85) — emits `AGENT_ACTION_EXECUTED` with no consumer.

Six events flow on the in-process `EventEmitter2` bus already:

| Event | Emitter | Subscribers (today) |
|---|---|---|
| `INGREDIENT_OVERRIDE_CHANGED` | `ingredients.service` | `labels.service` (cache invalidation) |
| `RECIPE_ALLERGENS_OVERRIDE_CHANGED` | `recipes-allergens.service` | `labels.service` |
| `RECIPE_SOURCE_OVERRIDE_CHANGED` | `recipes.service` | `cost.service` (rollup rebuild) |
| `RECIPE_INGREDIENT_UPDATED` | `recipes.service` | `cost.service` |
| `SUPPLIER_PRICE_UPDATED` | `supplier-items.controller` | `cost.service`, `dashboard.service` |
| `SUB_RECIPE_COST_CHANGED` | `cost.service` | `cost.service` (recursive rebuild) |
| `AGENT_ACTION_EXECUTED` | `agent-audit.middleware` | (none) |

Plus 2 events that ai-suggestions service should emit but currently doesn't (its audit lives inline on the row's status flip):
- `AI_SUGGESTION_ACCEPTED`
- `AI_SUGGESTION_REJECTED`

Memory captures the architectural debt: "**5 BCs reserved against future audit_log**". This slice extracts the pattern.

## Goals / Non-Goals

**Goals:**

- Single canonical `audit_log` table with a stable schema that survives across modules (M2 → M3 → ...).
- Stateless subscriber (`@OnEvent`-based) that writes one row per event. Decoupled from business logic.
- One `GET /audit-log` endpoint with filtering. RBAC Owner+Manager.
- Backfill historical rows from existing per-BC audit tables/columns (ai_suggestions accept/reject, recipe_cost_history, ingredient + recipe overrides) so cross-BC queries work from day one.
- Per-BC audit columns + endpoints stay (this slice is additive, no drop).
- Future BCs (M3+) opt in by emitting an event with `AuditEventEnvelope` shape; no audit-table changes needed for new BCs.

**Non-Goals:**

- Drop legacy per-BC audit columns (`recipe_cost_history` table, `ingredients.overrides` jsonb, `recipes.allergens_overrides` jsonb). Filed as `m2-audit-log-cleanup` follow-up.
- Search by free text — proper FTS index needed; separate slice.
- Audit retention / archival policy — keep all rows forever for now.
- Per-tenant CSV export endpoint — separate slice.
- Replay of audit events to rebuild state — not the use case; we have entity tables for state.

## Decisions

### ADR-AUDIT-SCHEMA — canonical audit_log row shape

```sql
CREATE TABLE "audit_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  "event_type" text NOT NULL CHECK (char_length(event_type) BETWEEN 1 AND 100),
  "aggregate_type" text NOT NULL CHECK (char_length(aggregate_type) BETWEEN 1 AND 50),
  "aggregate_id" uuid NOT NULL,
  "actor_user_id" uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  "actor_kind" text NOT NULL CHECK (actor_kind IN ('user', 'agent', 'system')),
  "agent_name" text NULL,
  "payload_before" jsonb NULL,
  "payload_after" jsonb NULL,
  "reason" text NULL CHECK (char_length(reason) <= 2000),
  "citation_url" text NULL,
  "snippet" text NULL CHECK (char_length(snippet) <= 500),
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "idx_audit_log_aggregate" ON "audit_log" ("organization_id", "aggregate_type", "aggregate_id", "created_at" DESC);
CREATE INDEX "idx_audit_log_event_type" ON "audit_log" ("organization_id", "event_type", "created_at" DESC);
CREATE INDEX "idx_audit_log_actor" ON "audit_log" ("organization_id", "actor_user_id", "created_at" DESC) WHERE "actor_user_id" IS NOT NULL;
```

**Rationale:**
- `event_type` is text (not enum) — enums require migrations to extend; M3+ will add many. App-side validation against a constants file gives the same safety with zero migration cost when adding a new event type.
- `aggregate_type` + `aggregate_id` is the polymorphic FK (no real FK because aggregate types span tables). The `(org, agg_type, agg_id, created_at DESC)` composite index makes drill-down ≤10ms even at multi-million row scale.
- `actor_kind` enum covers the 3 known sources: human via UI, agent via MCP, system (cron / migrations). Adding `external` (future webhooks) is a CHECK alter, not a schema change.
- `agent_name` is poblated only when `actor_kind='agent'`. We re-use the value already captured by `agent-audit.middleware`.
- `payload_before` / `payload_after` are jsonb — arbitrary shape per event type. Documented in the constants file alongside the event type.
- `reason` is nullable (only rejections / overrides have one); 2000-char cap.
- `citation_url` + `snippet` are nullable (only AI events). Mirror the existing `ai_suggestions` columns so AI events translate cleanly.
- 3 indexes cover the 3 expected access patterns. Avoid more indexes — the table is write-heavy; each index slows inserts.

**Alternative considered**: separate AI-event table because AI events have citation+snippet. Rejected — schema fragmentation; the cost of nullable columns is trivial vs. the cost of cross-table queries.

### ADR-AUDIT-MIGRATION — new + backfill in single migration

**Decision**: migration `0017_audit_log.ts` creates the table AND backfills historical events in one SQL transaction. No dual-write transitional period; new events flow through the subscriber from the moment the migration runs. Existing per-BC tables/columns stay untouched (deferred to `m2-audit-log-cleanup`).

Backfill source mapping:
- `ai_suggestions` rows where `status` ∈ ('accepted', 'rejected') → 1 audit row each, `event_type='AI_SUGGESTION_ACCEPTED'` or `_REJECTED`, `payload_after = row, reason = rejected_reason, citation_url + snippet = row's columns`
- `recipe_cost_history` rows → 1 audit row each, `event_type='RECIPE_COST_REBUILT', payload_after = row`
- `ingredients.overrides` jsonb (when non-empty) → 1 audit row per override entry in the jsonb array, `event_type='INGREDIENT_OVERRIDE_CHANGED'`
- `recipes.allergens_overrides` jsonb (when non-empty) → 1 audit row per entry, `event_type='RECIPE_ALLERGENS_OVERRIDE_CHANGED'`
- (No backfill for SUPPLIER_PRICE_UPDATED / RECIPE_INGREDIENT_UPDATED — those weren't persisted anywhere; we accept the gap. Going forward they're captured by the subscriber.)

**Rationale**: single source of truth from day one for the data we have. Operations get a queryable audit trail covering 100% of historical accept/reject decisions + cost rebuilds + overrides. Slight approximation for events that weren't persisted — accepted as known data gap (documented in retro).

**Alternative considered**: dual-write transitional (write to both old + new tables for one release, then cut over). Rejected — old tables stay anyway in this slice; dual-write adds complexity without benefit.

### ADR-AUDIT-WRITER — `@OnEvent` subscriber, not direct service injection

**Decision**: a single `AuditLogSubscriber` class subscribes via `@OnEvent` to all known event types. Each handler maps the event payload to an `AuditEventEnvelope` and calls `AuditLogService.record()` to persist.

The 5 audit-emitting BCs update their event payloads to use a typed `AuditEventEnvelope` shape (currently most emit ad-hoc objects). The envelope has the canonical fields the audit row needs:

```ts
interface AuditEventEnvelope<TBefore = unknown, TAfter = unknown> {
  organizationId: string;
  aggregateType: string;
  aggregateId: string;
  actorUserId: string | null;
  actorKind: 'user' | 'agent' | 'system';
  agentName?: string;
  payloadBefore: TBefore | null;
  payloadAfter: TAfter | null;
  reason?: string;
  citationUrl?: string;
  snippet?: string;
}
```

**Rationale**:
- **Decouples audit from business logic**: services don't import `AuditLogService`. They emit events; the subscriber handles persistence. If the subscriber crashes, business logic continues; we lose an audit row but not a write.
- **Already wired**: 6 of the 7 events are already published. We just add one subscriber.
- **Adding a new event = 1 line of `@OnEvent`** in the subscriber (and a constants file entry).
- **Testable in isolation**: subscriber unit tests assert "given event X, write row with shape Y". No service-level mocking needed.

**Alternative considered**: inject `AuditLogService` into each BC service and call `recordEvent()` directly. Rejected — couples every BC to audit infrastructure, requires touching 5+ services for every audit-related change, and risks "forgetting to audit" when adding new mutations.

### ADR-AUDIT-ENDPOINT — single canonical endpoint, no per-BC wrappers

**Decision**: one endpoint `GET /audit-log` with query parameters for filtering:

```
GET /audit-log?
  organizationId=<uuid>           (required)
  &aggregateType=<string>          (optional)
  &aggregateId=<uuid>              (optional)
  &eventType=<string>              (optional, comma-separated for OR)
  &actorUserId=<uuid>              (optional)
  &actorKind=<user|agent|system>   (optional)
  &since=<iso-8601>                (optional, default = now-30d)
  &until=<iso-8601>                (optional, default = now)
  &limit=<int 1-200>               (optional, default 50)
  &offset=<int>                    (optional, default 0)
```

Returns:
```ts
interface AuditLogPage {
  rows: AuditLogResponseDto[];
  total: number;
  limit: number;
  offset: number;
}
```

**RBAC**: Owner + Manager. Staff = 403. Multi-tenant isolation enforced via `organizationId` param + the global `OrganizationGuard`.

**Rationale**:
- One endpoint, composable filters. The client builds the URL it needs.
- No per-BC wrapper endpoints (e.g. `/recipes/:id/audit`, `/ingredients/:id/audit`) — those would multiply maintenance with no functional benefit. The same drill-down works as `?aggregateType=recipe&aggregateId=<id>`.
- Pagination capped at 200 rows; default 30-day window prevents accidental table scans.
- Returns total count for pagination UI.

**Alternative considered**: GraphQL endpoint for richer query composition. Rejected — overkill for a single resource; adds a new dependency to evaluate later for the whole API.

## Risks / Trade-offs

- **[Risk] Subscriber crashes silently swallow audit events.** **Mitigation**: subscriber wraps each handler in try/catch + logs error with `event_type + aggregate_id`. Operator monitors via existing log infra. The crash doesn't take down the emitter (events are fire-and-forget on the bus); a second slice could add a dead-letter queue if reliability becomes a concern.
- **[Risk] High write volume on the new table.** **Mitigation**: indexed only on the 3 expected access patterns. Insert path is single row + 3 index updates ≤1ms. Storage growth (~22 GB/month/heavy-org) is well within Postgres's wheelhouse for years; partitioning by month is a future optimisation.
- **[Risk] Backfill writes O(N) rows on migration.** **Mitigation**: migration runs in a transaction; on a fresh schema with light data this is fast. If an existing org has millions of pre-existing override jsonb entries, the migration could be slow — but that's a one-time cost. Migration includes progress logging.
- **[Risk] Polymorphic FK (no real FK between audit_log.aggregate_id and the entity tables).** **Mitigation**: documented as design choice; aggregate_id values are validated app-side by the event payload itself (the entity has to exist to emit the event).
- **[Trade-off] Per-BC audit columns stay around.** Accepted: the cleanup is a follow-up slice with its own migration. Two sources of truth for one release; the canonical path is `audit_log`, the legacy columns are deprecated-but-readable.
- **[Trade-off] Five existing BCs need event-payload updates.** Accepted: the change is mechanical (replace ad-hoc payload with typed envelope). Each BC's existing tests should still pass; we add unit tests for the new envelope shape.

## Migration Plan

1. New module `apps/api/src/audit-log/` with `domain/audit-log.entity.ts`, `application/audit-log.service.ts`, `application/audit-log.subscriber.ts`, `application/types.ts` (envelope + event constants), `application/errors.ts`, `interface/audit-log.controller.ts`, `interface/dto/`.
2. Migration `0017_audit_log.ts` creates table + indexes + backfills from the 4 existing sources.
3. Update 5 BCs to publish typed `AuditEventEnvelope`:
   - `apps/api/src/cost/application/cost.service.ts` (RECIPE_COST_REBUILT — new event)
   - `apps/api/src/ingredients/application/ingredients.service.ts` (INGREDIENT_OVERRIDE_CHANGED)
   - `apps/api/src/recipes/application/recipes-allergens.service.ts` (RECIPE_ALLERGENS_OVERRIDE_CHANGED)
   - `apps/api/src/ai-suggestions/application/ai-suggestions.service.ts` (NEW emits AI_SUGGESTION_ACCEPTED / _REJECTED on `accept` / `reject`)
   - `apps/api/src/shared/middleware/agent-audit.middleware.ts` (AGENT_ACTION_EXECUTED — already emits, just add envelope)
4. Wire `AuditLogModule` into `app.module.ts`.
5. Tests: ~30 new tests across entity + service + subscriber + controller.
6. CI green; admin-merge once required checks pass.

**Rollback**: drop `audit_log` table + remove subscriber. Per-BC audit columns and endpoints continue to work as before.

## Open Questions

- **Should the subscriber use an async queue (BullMQ) instead of in-process `@OnEvent`?** Decision: no, ship in-process for now. Bull adds Redis dependency. If write volume justifies decoupling, add it as a follow-up — the subscriber's interface stays the same; only the transport changes.
- **Should we emit a synthetic `RECIPE_COST_REBUILT` event from cost.service for backfill consistency?** Decision: yes — currently `recipe_cost_history` is the only sink for cost rebuilds; emitting an event lets the audit subscriber capture future rebuilds without touching cost.service for every audit-related change.
- **Should `payload_before` capture full entity snapshots or just the delta?** Decision: full snapshots for now (jsonb is cheap). Allows reconstructing prior state. Compaction is a future concern.
