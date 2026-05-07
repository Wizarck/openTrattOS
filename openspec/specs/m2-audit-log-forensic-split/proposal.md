# Proposal: m2-audit-log-forensic-split

> **Wave 1.14** — first slice after the m2-mcp-extras saga (Wave 1.13 [3a/3b/3c]). Closes the longest-running tech-debt thread filed across both the audit-log sub-saga (Wave 1.9–1.12) and the MCP-extras trio: the `AGENT_ACTION_EXECUTED` channel carries two payload shapes (lean from the legacy `AgentAuditMiddleware`; rich from the 3a `BeforeAfterAuditInterceptor` and the 3b `AgentChatService`) discriminated at runtime by `isRichAuditEnvelope()` in the subscriber. Three call sites now share one channel; the discrimination is silent and defensive. This slice splits the channel into two type-system-distinct event types and consolidates the audit-log architecture into canonical ADRs + a single operator runbook.

## Problem

`AGENT_ACTION_EXECUTED` was introduced in Wave 1.5 as a lean attribution event emitted from `AgentAuditMiddleware` for every agent-flagged HTTP request. Wave 1.9 (`m2-audit-log`) added the canonical `audit_log` table and routed the lean event through `AuditLogSubscriber.onAgentActionExecuted()`, anchoring it to `aggregate_type = 'organization'` because the lean payload has no aggregate.

Wave 1.13 [3a] (`m2-mcp-write-capabilities`) added the `BeforeAfterAuditInterceptor` which emits a rich `AuditEventEnvelope` per agent **mutation** (with real `aggregateType` + `aggregateId` + `payloadBefore` + `payloadAfter`). Rather than introduce a new channel, the slice reused `AGENT_ACTION_EXECUTED` and patched the subscriber with `isRichAuditEnvelope(event)` to discriminate by shape and persist as-is. The 3a retro flagged the split as M3+ tech-debt: "Future cleanup: split into two distinct event types so the discrimination is type-system-level, not runtime-shape-level."

Wave 1.13 [3b] (`m2-mcp-agent-chat-widget`) added a third call site: `AgentChatService` emits a rich envelope from the SSE Observable's terminal callback (because the `BeforeAfterAuditInterceptor` is incompatible with `@Sse()` handlers). The 3b retro reaffirmed the split: "three call sites (lean middleware, 3a interceptor, 3b service) sharing one channel pushes the case for the split."

Concurrently, the audit-log subsystem now spans 4 shipped slices (Waves 1.9 audit_log → 1.10 cost-history-merge → 1.11 FTS → 1.12 export) plus 3 emit-site slices (1.13 [3a/3b/3c]). The architectural patterns that emerged — single subscriber with hybrid translation, two-name pattern (channel vs persisted event_type), polymorphic FK without DB constraint, UUID-typed `aggregate_id`, open-enum text `event_type`, streaming-handler audit emission via terminal callback — live only in slice retros and per-slice `design.md` files. `master/docs/architecture-decisions.md` carries ADR-001 → ADR-024 covering modules, RBAC, currency, AI corpus, frontend stack… and **zero ADRs** about the audit-log subsystem.

Operators have no single document to consult. They have to thread together `m2-audit-log-runbook` (which doesn't exist), the 3 mcp-* runbooks (each with a brief audit emission section), and per-slice retros to understand how an agent write produces audit rows, how to query them, and how the FTS + CSV-export endpoints relate.

## Goals

1. **Split the channel** by introducing `AGENT_ACTION_FORENSIC` (rich, aggregate-anchored) alongside the existing `AGENT_ACTION_EXECUTED` (lean, request-anchored). Three emit sites move:
   - `AgentAuditMiddleware` → keeps emitting `AGENT_ACTION_EXECUTED` (unchanged).
   - `BeforeAfterAuditInterceptor` → emits `AGENT_ACTION_FORENSIC`.
   - `AgentChatService` → emits `AGENT_ACTION_FORENSIC`.
2. **Remove `isRichAuditEnvelope()` runtime discrimination** from `AuditLogSubscriber.onAgentActionExecuted()`. The handler becomes lean-only; a new `@OnEvent(AGENT_ACTION_FORENSIC)` handler persists envelopes as-is via `persistEnvelope()`.
3. **Backfill historical rows** with one migration: `UPDATE audit_log SET event_type='AGENT_ACTION_FORENSIC' WHERE event_type='AGENT_ACTION_EXECUTED' AND aggregate_type != 'organization'`. Down migration reverses. Open-enum text column means no schema change is needed.
4. **Lift cross-slice patterns into 3 canonical ADRs** in `master/docs/architecture-decisions.md`:
   - ADR-025: audit_log canonical architecture (subscriber pattern + envelope + polymorphic FK + UUID-typed `aggregate_id` + open-enum text `event_type` + two-name pattern).
   - ADR-026: forensic agent-event split (this slice's decision, recorded as it ships).
   - ADR-027: streaming-handler audit pattern (`@Sse()` handlers emit from Observable terminal callback with `auditEmitted` flag; aggregate_id = `randomUUID()` per turn; opaque session id stored in `payload_after`).
5. **Single operator runbook** (`docs/operations/audit-log-runbook.md`) covering schema, query API, FTS usage, CSV export, agent dual-channel emission, and 5+ troubleshooting recipes. References per-slice runbooks for slice-specific setup; this is the cross-cutting consolidation.

## Non-goals

- **Migrating the 6 legacy translators in `AuditLogSubscriber`** to envelope shape. Filed as `m2-audit-log-emitter-migration` in the Wave 1.9 retro and remains M3+ tech-debt; touching it here would expand the slice across 6 BCs (cost / ingredients / recipes / supplier-items) and several `@OnEvent` consumers.
- **Audit-log table partitioning** (`m2-audit-log-partition`). Volume-driven follow-up; trigger is ~10M rows/org which we are nowhere near.
- **DLQ for failed audit writes** (`m2-audit-log-dlq`). Current "log + drop" behaviour stays; documented in the runbook as accepted trade-off.
- **Async export jobs** (`m2-audit-log-export-async`). Filed for >100K-row dumps; out of scope here.
- **Renaming `AGENT_ACTION_EXECUTED`**. Operators with existing dashboards/queries on the lean rows would break. The lean event type retains its identity; only the rich emissions move to the new event type.
- **Owner UI for audit_log**. Today operators query via REST (`GET /audit-log`), CSV export, or psql. UI is filed as `m2-audit-log-ui` for a future slice.

## What changes (high level)

**Code (apps/api):**

- `audit-log/application/types.ts`:
  - Add `AGENT_ACTION_FORENSIC: 'agent.action-forensic'` to `AuditEventType`.
  - Add the persisted-name mapping to `AuditEventTypeName`.
- `cost/application/cost.events.ts`:
  - Add the `AGENT_ACTION_FORENSIC` channel constant. The `AgentActionForensicEvent` type alias matches `AuditEventEnvelope`.
- `audit-log/application/audit-log.subscriber.ts`:
  - New `@OnEvent(AGENT_ACTION_FORENSIC)` handler — calls `persistEnvelope()` directly.
  - `onAgentActionExecuted()` becomes lean-only. The `isRichAuditEnvelope()` helper + branch are deleted.
- `shared/interceptors/before-after-audit.interceptor.ts`:
  - Change emit channel from `AGENT_ACTION_EXECUTED` to `AGENT_ACTION_FORENSIC`. Payload shape unchanged.
- `agent-chat/application/agent-chat.service.ts`:
  - Same — emit on `AGENT_ACTION_FORENSIC` from the Observable terminal callback. `auditEmitted` flag + `randomUUID()` aggregate id semantics preserved (ADR-027 codifies them).
- `shared/middleware/agent-audit.middleware.ts`:
  - Unchanged. Lean middleware keeps emitting `AGENT_ACTION_EXECUTED`.

**Migration:**

- `0022_audit_log_forensic_split.ts`:
  - up: `UPDATE audit_log SET event_type='AGENT_ACTION_FORENSIC' WHERE event_type='AGENT_ACTION_EXECUTED' AND aggregate_type != 'organization'`.
  - down: reverse — `UPDATE audit_log SET event_type='AGENT_ACTION_EXECUTED' WHERE event_type='AGENT_ACTION_FORENSIC'`.
  - `hasTable('audit_log')` guard for fresh-schema safety (per the established pattern from migrations 0017 + 0018 + 0019).

**Docs:**

- `master/docs/architecture-decisions.md` — append ADR-025, ADR-026, ADR-027.
- `master/docs/operations/audit-log-runbook.md` (NEW) — single operator runbook for the audit-log subsystem (schema, query, FTS, CSV, agent dual-channel, troubleshooting).

**Tests:**

- Adapt existing specs:
  - `audit-log.subscriber.spec.ts` — add tests for the new handler; remove the `isRichAuditEnvelope` branch tests; ensure lean-only path keeps working.
  - `before-after-audit.interceptor.spec.ts` — assert emit on `AGENT_ACTION_FORENSIC` (was `AGENT_ACTION_EXECUTED`).
  - `agent-chat.service.spec.ts` — same emission-target assertions.
  - `agent-write-capabilities.int.spec.ts` — assert two distinct rows per agent write (one lean, one forensic) with the expected `event_type` values.
  - `agent-chat.int.spec.ts` — same; the rich row's `event_type` becomes `AGENT_ACTION_FORENSIC`.
- New unit tests:
  - `audit-log.subscriber.spec.ts` — `AGENT_ACTION_FORENSIC` envelope-as-is persistence + null org skip + record() failure swallowed.
  - `migration-0022.spec.ts` (or inline in INT) — backfill UPDATE WHERE clause correctness on a seeded fixture.

## Acceptance

1. Three audit-event call sites are typed at compile time:
   - `AgentAuditMiddleware.events.emit(AGENT_ACTION_EXECUTED, leanPayload)` — lean payload type matches `AgentActionExecutedEvent`.
   - `BeforeAfterAuditInterceptor` and `AgentChatService` both emit `AGENT_ACTION_FORENSIC` with `AuditEventEnvelope`.
2. `AuditLogSubscriber` has TWO `@OnEvent` handlers for agent rows: one for the lean event (calls `persistTranslated`), one for the forensic event (calls `persistEnvelope`). No `isRichAuditEnvelope()` helper remains.
3. `audit_log` rows emitted after this slice carry `event_type='AGENT_ACTION_EXECUTED'` (lean, `aggregate_type='organization'`) OR `event_type='AGENT_ACTION_FORENSIC'` (rich, `aggregate_type ∈ {recipe, menu_item, ingredient, ...}`). No overlap.
4. Migration 0022 reassigns historical rich rows from `AGENT_ACTION_EXECUTED` to `AGENT_ACTION_FORENSIC` based on `aggregate_type != 'organization'`.
5. `docs/architecture-decisions.md` carries ADR-025/026/027.
6. `docs/operations/audit-log-runbook.md` exists and references the per-slice mcp runbooks for setup detail.
7. apps/api unit tests green, INT specs green (real Postgres), CodeRabbit clean. Build clean. Lint clean.
8. No regression in CSV export, FTS query, or any existing audit-log-consumer code path.

## Risk + mitigation

- **Risk: an existing operator dashboard/query filters by `event_type='AGENT_ACTION_EXECUTED'` expecting BOTH lean and rich rows.** Mitigation: ADR-026 + the runbook document the post-migration shape explicitly. The migration backfills historical data so the dashboard's filter behaviour cleaves cleanly along `aggregate_type` after deploy. We have no known dashboards yet (M2 just shipped); this is the right time to split.
- **Risk: ADR scope creep — promoting too many retro lessons into ADRs.** Mitigation: 3 ADRs are pre-agreed at Gate D. No additional canonical architecture docs in this slice.
- **Risk: runbook becomes a duplicate of per-slice runbooks.** Mitigation: the runbook is a cross-cutting consolidation — it references per-slice runbooks for setup and focuses on the audit_log subsystem itself (what rows look like, how to query them, what each event_type means).
- **Risk: down-migration leaves the DB in a hybrid state if rolled back partway.** Mitigation: the migration is a single transaction. Down reverses cleanly. Operators rolling back lose the type-system clarity gain but keep all historical data; the application code rolls back along with the migration.

## Open questions

None at the time of writing — Gate D picks resolved all forks (slice name, new event-type name, backfill strategy, ADR scope, runbook scope).

## Related slices + threads

- Wave 1.9 `m2-audit-log` (Squash `1e420a6`) — canonical `audit_log` table; single subscriber pattern; hybrid translation.
- Wave 1.10 `m2-audit-log-cost-history-merge` (Squash `c43456d`) — drop legacy table; backward-compat unpack helper; single canonical persistence.
- Wave 1.11 `m2-audit-log-fts` (Squash `e7e1fb1`) — Postgres dual-config FTS via functional GIN indexes.
- Wave 1.12 `m2-audit-log-export` (Squash `87d5c91`) — streaming CSV export; cursor pagination; pre-flight count.
- Wave 1.13 [3a] `m2-mcp-write-capabilities` (Squash `9020550`) — `BeforeAfterAuditInterceptor` introduced rich envelope on `AGENT_ACTION_EXECUTED`; `isRichAuditEnvelope()` discrimination filed as M3+ tech-debt.
- Wave 1.13 [3b] `m2-mcp-agent-chat-widget` (Squash `17d7b28`) — `AgentChatService` added a third emit site; streaming-handler audit pattern codified in feedback memory.
- Wave 1.13 [3c] `m2-mcp-agent-registry-bench` (Squash `17b37c1`) — Ed25519 signing; SSE idempotency replay; SSE `event_type` discriminator behaviour preserved.
