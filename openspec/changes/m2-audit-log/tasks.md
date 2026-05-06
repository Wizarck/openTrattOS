## 1. Migration 0017 — audit_log table + backfill

- [ ] 1.1 `apps/api/src/migrations/0017_audit_log.ts` — create table per ADR-AUDIT-SCHEMA (14 columns, 3 indexes, CHECK constraints)
- [ ] 1.2 Same migration: backfill from `ai_suggestions` (status='accepted'/'rejected') → audit_log rows with `event_type='AI_SUGGESTION_ACCEPTED'`/`_REJECTED`
- [ ] 1.3 Same migration: backfill from `recipe_cost_history` → audit rows with `event_type='RECIPE_COST_REBUILT'`, payload_after = serialized history row
- [ ] 1.4 Same migration: backfill from `ingredients.overrides` jsonb (when non-empty) → 1 audit row per override entry, `event_type='INGREDIENT_OVERRIDE_CHANGED'`
- [ ] 1.5 Same migration: backfill from `recipes.allergens_overrides` jsonb (when non-empty) → 1 audit row per entry, `event_type='RECIPE_ALLERGENS_OVERRIDE_CHANGED'`
- [ ] 1.6 Migration includes `console.log` progress every 1000 backfilled rows for ops visibility
- [ ] 1.7 Down migration drops `audit_log` table (no reverse backfill — destructive operation explicitly intended for rollback)

## 2. AuditLog domain + entity

- [ ] 2.1 `apps/api/src/audit-log/domain/audit-log.entity.ts` — TypeORM entity matching the migration shape
- [ ] 2.2 `apps/api/src/audit-log/application/types.ts` — `AuditEventEnvelope<TBefore, TAfter>` interface + 8 known `AuditEventType` constants:
  - `AI_SUGGESTION_ACCEPTED`, `AI_SUGGESTION_REJECTED`
  - `INGREDIENT_OVERRIDE_CHANGED`
  - `RECIPE_ALLERGENS_OVERRIDE_CHANGED`
  - `RECIPE_SOURCE_OVERRIDE_CHANGED`
  - `RECIPE_INGREDIENT_UPDATED`
  - `SUPPLIER_PRICE_UPDATED`
  - `RECIPE_COST_REBUILT` (NEW — emitted by cost.service for backfill consistency)
  - `AGENT_ACTION_EXECUTED`
- [ ] 2.3 `apps/api/src/audit-log/application/errors.ts` — `AuditLogQueryError` (e.g. invalid date range, limit out of bounds)

## 3. AuditLogService + AuditLogSubscriber

- [ ] 3.1 `apps/api/src/audit-log/application/audit-log.service.ts`:
  - `record(envelope: AuditEventEnvelope): Promise<AuditLog>` — persist a row
  - `query(filter: AuditLogFilter): Promise<AuditLogPage>` — apply filters + pagination, return `{ rows, total, limit, offset }`
- [ ] 3.2 `apps/api/src/audit-log/application/audit-log.subscriber.ts`:
  - 8 `@OnEvent(AUDIT_EVENT_TYPE)` handlers, one per known type
  - Each handler maps the event payload to `AuditEventEnvelope` shape and calls `service.record()`
  - try/catch wrapper around each handler — log error with `event_type + aggregate_id`, do NOT re-throw (don't break emitter)

## 4. 5 BCs emit typed envelope

- [ ] 4.1 `apps/api/src/cost/application/cost.service.ts` — emit new `RECIPE_COST_REBUILT` event with envelope shape on every `computeWithEm` cache miss that produces a new history row
- [ ] 4.2 `apps/api/src/ingredients/application/ingredients.service.ts` — `INGREDIENT_OVERRIDE_CHANGED` payload becomes typed envelope
- [ ] 4.3 `apps/api/src/recipes/application/recipes-allergens.service.ts` — `RECIPE_ALLERGENS_OVERRIDE_CHANGED` payload becomes typed envelope
- [ ] 4.4 `apps/api/src/recipes/application/recipes.service.ts` — `RECIPE_SOURCE_OVERRIDE_CHANGED` + `RECIPE_INGREDIENT_UPDATED` payloads become typed envelopes
- [ ] 4.5 `apps/api/src/ai-suggestions/application/ai-suggestions.service.ts` — emit `AI_SUGGESTION_ACCEPTED` / `_REJECTED` on `accept` / `reject` (currently audit lives inline on row.status; now also emit event for cross-BC audit table)
- [ ] 4.6 `apps/api/src/suppliers/interface/supplier-items.controller.ts` — `SUPPLIER_PRICE_UPDATED` payload becomes typed envelope
- [ ] 4.7 `apps/api/src/shared/middleware/agent-audit.middleware.ts` — `AGENT_ACTION_EXECUTED` payload becomes typed envelope

## 5. GET /audit-log endpoint + DTOs + RBAC

- [ ] 5.1 `apps/api/src/audit-log/interface/dto/audit-log-query.dto.ts` — class-validator DTO with optional filters (organizationId required, others optional + ranges + pagination)
- [ ] 5.2 `apps/api/src/audit-log/interface/dto/audit-log-response.dto.ts` — response shape `{ id, eventType, aggregateType, aggregateId, actorUserId, actorKind, agentName, payloadBefore, payloadAfter, reason, citationUrl, snippet, createdAt }`
- [ ] 5.3 `apps/api/src/audit-log/interface/audit-log.controller.ts`:
  - `GET /audit-log` returns `AuditLogPage`
  - RBAC: Owner+Manager only (Staff blocked at 403)
  - Multi-tenant via `organizationId` param + global guard

## 6. Module wiring

- [ ] 6.1 `apps/api/src/audit-log/audit-log.module.ts` — Nest module
- [ ] 6.2 `apps/api/src/app.module.ts` — register `AuditLogModule`

## 7. Tests

- [ ] 7.1 Entity: factory + invariants (≥3 tests)
- [ ] 7.2 Service: `record()` writes a row, `query()` filters + paginates correctly (≥10 tests covering each filter axis, default date window, max limit, total count accuracy)
- [ ] 7.3 Subscriber: each `@OnEvent` handler maps event → row correctly (≥8 tests, one per event type) + try/catch swallows errors without breaking emitter (1 test)
- [ ] 7.4 Controller: RBAC (Owner OK, Manager OK, Staff 403, no auth 401) + filter passthrough + DTO validation
- [ ] 7.5 Migration: backfill correctness for each of 4 sources (≥4 INT tests with seeded data)
- [ ] 7.6 Cross-BC integration: emit event from existing service → audit row visible via /audit-log

## 8. Verification

- [ ] 8.1 `openspec validate m2-audit-log` passes
- [ ] 8.2 `npm test --workspace=apps/api` green; ≥30 new tests
- [ ] 8.3 Lint clean across workspaces
- [ ] 8.4 Build clean
- [ ] 8.5 No regression in existing 803 TS tests

## 9. CI + landing

- [ ] 9.1 Implementation pushed
- [ ] 9.2 All CI checks green; admin-merge once required checks pass
- [ ] 9.3 Archive `openspec/changes/m2-audit-log/` → `openspec/specs/m2-audit-log/`
- [ ] 9.4 Write `retros/m2-audit-log.md`
- [ ] 9.5 Update auto-memory `project_m1_state.md` — Wave 1.9 closed; pivot to next slice
- [ ] 9.6 File follow-up slices:
  - `m2-audit-log-cleanup` — drop redundant per-BC audit columns + tables (recipe_cost_history, ingredients.overrides jsonb, recipes.allergens_overrides jsonb)
  - `m2-audit-log-export` — `GET /audit-log/export.csv` for offline analysis
  - `m2-audit-log-fts` — Postgres full-text-search index on payload + reason + snippet for cross-BC search by free text
