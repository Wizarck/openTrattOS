## ADDED Requirements

### Requirement: Canonical audit_log table captures cross-BC mutation events

The system SHALL provide a canonical `audit_log` table that captures every business-relevant mutation event from any bounded context, with a stable schema that survives module evolution. The table SHALL store the event type, aggregate identity, actor identity + kind, before/after payloads, reason, and (for AI events) citation URL + snippet.

#### Scenario: AI suggestion acceptance is recorded
- **WHEN** a Manager accepts an AI yield suggestion via `POST /ai-suggestions/:id/accept`
- **THEN** an `audit_log` row is written with `event_type='AI_SUGGESTION_ACCEPTED'`, `aggregate_type='ai_suggestion'`, `aggregate_id=<suggestionId>`, `actor_kind='user'`, `actor_user_id=<managerId>`, `payload_after` containing the row state, and `citation_url` + `snippet` mirrored from the suggestion

#### Scenario: Ingredient override is recorded
- **WHEN** an Owner updates an ingredient's nutritional override via `PUT /ingredients/:id/override`
- **THEN** an `audit_log` row is written with `event_type='INGREDIENT_OVERRIDE_CHANGED'`, `aggregate_type='ingredient'`, `aggregate_id=<ingredientId>`, `payload_before` containing the prior override state, `payload_after` containing the new state

#### Scenario: Agent action is recorded with agent name
- **WHEN** an MCP-connected agent performs a write action carrying `X-Via-Agent`/`X-Agent-Name` headers
- **THEN** an `audit_log` row is written with `actor_kind='agent'`, `agent_name=<header value>`, `actor_user_id=<the user the agent acted on behalf of, or null>`

#### Scenario: System event has no actor user
- **WHEN** a scheduled cost rebuild fires (no human/agent in scope)
- **THEN** an `audit_log` row is written with `actor_kind='system'`, `actor_user_id=null`, `agent_name=null`

### Requirement: AuditLogSubscriber persists events from the in-process event bus

The system SHALL register a single subscriber class with `@OnEvent` handlers for every known audit event type. Each handler SHALL map the event payload (an `AuditEventEnvelope`) to an audit_log row and persist it. Handler errors SHALL be caught + logged without re-throwing, so a failing audit write does NOT break the emitter's business logic.

#### Scenario: Subscriber crash does not break emitter
- **WHEN** the subscriber throws (e.g. database temporarily unreachable) while handling `INGREDIENT_OVERRIDE_CHANGED`
- **THEN** the emitting service (`ingredients.service`) completes the write to the entity table successfully; the failed audit write is logged with `event_type + aggregate_id` for ops visibility; no exception propagates to the controller

#### Scenario: New event type added with one line
- **WHEN** a new BC (e.g. M3 HACCP) emits `HACCP_INCIDENT_REPORTED` on the event bus
- **THEN** adding `@OnEvent('HACCP_INCIDENT_REPORTED')` to the subscriber + a constants-file entry is sufficient to capture audit rows; no migration, no schema change, no controller change

### Requirement: GET /audit-log endpoint provides filtered + paginated history

The system SHALL expose `GET /audit-log` with required `organizationId` query parameter and optional filters (`aggregateType`, `aggregateId`, `eventType`, `actorUserId`, `actorKind`, `since`, `until`) plus pagination (`limit` default 50 max 200, `offset` default 0). The endpoint SHALL be RBAC-gated to Owner + Manager; Staff SHALL receive HTTP 403.

#### Scenario: Manager queries audit for a specific recipe
- **WHEN** a Manager calls `GET /audit-log?organizationId=<org>&aggregateType=recipe&aggregateId=<recipeId>`
- **THEN** the endpoint returns rows ordered by `created_at` descending, paginated to 50 by default, with `total` count for pagination UI

#### Scenario: Staff role is blocked
- **WHEN** a Staff user calls `GET /audit-log?organizationId=<org>`
- **THEN** the endpoint returns HTTP 403 with `code='FORBIDDEN'`

#### Scenario: Default date window is last 30 days
- **WHEN** a request omits `since` / `until`
- **THEN** the query bounds default to `[now-30d, now]` to prevent accidental table scans

#### Scenario: Cross-org access is blocked
- **WHEN** a Manager belonging to org A queries `GET /audit-log?organizationId=<orgB>`
- **THEN** the global organization guard rejects the request before the query runs

### Requirement: Migration 0017 backfills historical events from existing per-BC audit sources

The migration that creates `audit_log` SHALL backfill historical rows from the four existing per-BC audit sources: `ai_suggestions` (accept/reject rows), `recipe_cost_history` (cost rebuild rows), `ingredients.overrides` jsonb arrays, and `recipes.allergens_overrides` jsonb arrays. Per-BC audit columns and tables SHALL NOT be dropped in this slice (deferred to follow-up `m2-audit-log-cleanup`).

#### Scenario: ai_suggestions accept is backfilled
- **WHEN** the migration runs against a database with a pre-existing `ai_suggestions` row where `status='accepted'`
- **THEN** an `audit_log` row is created with `event_type='AI_SUGGESTION_ACCEPTED'`, `payload_after` capturing the suggestion row, `citation_url` + `snippet` mirrored from the suggestion's columns

#### Scenario: Ingredient overrides jsonb array yields one audit row per entry
- **WHEN** the migration encounters an `ingredients.overrides` jsonb array with N entries
- **THEN** N audit_log rows are inserted, one per entry, with `event_type='INGREDIENT_OVERRIDE_CHANGED'` and `payload_after` containing the entry

#### Scenario: Per-BC audit columns survive the migration
- **WHEN** the migration completes
- **THEN** the `recipe_cost_history` table, the `ingredients.overrides` column, and the `recipes.allergens_overrides` column remain intact and queryable; only the new `audit_log` table has been added

### Requirement: AuditEventEnvelope is the typed contract for emitting auditable events

Bounded contexts SHALL emit auditable events using the `AuditEventEnvelope` typed shape so the subscriber can map events to audit rows without per-event-type translation logic. The envelope SHALL include `organizationId`, `aggregateType`, `aggregateId`, `actorUserId`, `actorKind`, optional `agentName`, `payloadBefore`, `payloadAfter`, optional `reason`, and optional `citationUrl` + `snippet` (for AI events).

#### Scenario: Existing emitters are migrated to typed envelope
- **WHEN** the 5 existing audit-emitting BCs (`cost`, `ingredients`, `recipes`/`recipes-allergens`, `ai-suggestions`, `agent-audit-middleware`) are updated as part of this slice
- **THEN** each existing emit call uses the `AuditEventEnvelope` shape; no behavioural change to the emitting service or its subscribers; existing tests for each BC continue to pass

#### Scenario: Cost rebuild emits a new event for backfill consistency
- **WHEN** the cost service produces a new `recipe_cost_history` row via `computeWithEm`
- **THEN** the service additionally emits a `RECIPE_COST_REBUILT` event with the typed envelope so future cost rebuilds are captured by the audit subscriber alongside the historical backfill
