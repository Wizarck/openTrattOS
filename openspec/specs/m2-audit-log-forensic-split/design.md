# Design: m2-audit-log-forensic-split

> Wave 1.14. Companion: `proposal.md`. Carries the architectural decisions that ship as canonical ADRs in `master/docs/architecture-decisions.md`.

## Architecture (after this slice)

```
┌──────────────────────────────────────────────────────────────────────┐
│  apps/api request lifecycle                                          │
│                                                                      │
│  HTTP request                                                        │
│      │                                                               │
│      ▼                                                               │
│  AgentSignatureMiddleware (3c) ── verify Ed25519 if flag on          │
│      │                                                               │
│      ▼                                                               │
│  AgentAuditMiddleware (1.5)                                          │
│      ├── reads X-Via-Agent / X-Agent-Name / X-Agent-Capability       │
│      ├── stamps req.agentContext (lean)                              │
│      └── emits ─────► AGENT_ACTION_EXECUTED (lean payload)           │
│      │                                                               │
│      ▼                                                               │
│  IdempotencyMiddleware (3a + 3c SSE replay)                          │
│      │                                                               │
│      ▼                                                               │
│  Guards (RBAC + AgentCapabilityGuard)                                │
│      │                                                               │
│      ▼                                                               │
│  Controller method ── @AuditAggregate('recipe', idExtractor?)        │
│      │                                                               │
│      ▼                                                               │
│  BeforeAfterAuditInterceptor (3a)                                    │
│      ├── resolves payloadBefore via AuditResolverRegistry            │
│      ├── invokes the handler (or downstream Observable for @Sse)     │
│      ├── captures payloadAfter from the unwrapped envelope           │
│      └── emits ─────► AGENT_ACTION_FORENSIC (rich envelope)          │
│      │                  ↑                                            │
│      │                  │  NOT used by @Sse() handlers; chat path    │
│      │                  │  emits directly from the Observable's      │
│      │                  │  terminal callback (ADR-027).              │
│      ▼                                                               │
│  Response goes back to client                                        │
│                                                                      │
│  ─── separate event-bus consumer ────────────────────────────────    │
│                                                                      │
│  AuditLogSubscriber (single class, @Injectable)                      │
│      ├── @OnEvent(AGENT_ACTION_EXECUTED)  → onAgentActionExecuted    │
│      │                                       (lean → translate)      │
│      ├── @OnEvent(AGENT_ACTION_FORENSIC)  → onAgentActionForensic    │
│      │                                       (rich → persistEnvelope)│
│      ├── @OnEvent(AI_SUGGESTION_ACCEPTED) → persistEnvelope          │
│      ├── @OnEvent(AI_SUGGESTION_REJECTED) → persistEnvelope          │
│      ├── @OnEvent(RECIPE_COST_REBUILT)    → persistEnvelope          │
│      └── 5 legacy translators (INGREDIENT/RECIPE/SUPPLIER…)          │
│                                                                      │
│      All handlers wrapped in try/catch; DB errors log + drop.        │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

## ADRs

The 3 canonical ADRs are written into `master/docs/architecture-decisions.md` as Stage 2 of this slice. They are reproduced here in full so design.md is self-contained for review.

### ADR-025: audit_log canonical architecture

**Decision:** The `audit_log` table is the **single canonical source of truth** for cross-BC event-history persistence. Bounded contexts emit typed events on `EventEmitter2` channels; a single `AuditLogSubscriber` (`apps/api/src/audit-log/application/audit-log.subscriber.ts`) listens on every channel and persists one `audit_log` row per event. Services do not import `AuditLogService` directly; they emit, the subscriber writes.

The persistence shape is governed by the `AuditEventEnvelope<TBefore, TAfter>` interface: 14 columns matching the migration (`organization_id`, `aggregate_type`, `aggregate_id`, `actor_user_id`, `actor_kind`, `agent_name`, `payload_before`, `payload_after`, `reason`, `citation_url`, `snippet`, `created_at` + identity columns). The envelope is the same shape for envelope-shaped channels (AI suggestions, cost rebuild, agent forensic) and the translation target for legacy ad-hoc payload channels (cost.* + agent.action-executed lean).

**Rules enforced:**

- **Two-name pattern** — bus channel name preserves module ownership for routing (`cost.ingredient-override-changed`, `agent.action-executed`); persisted `event_type` is the public, module-agnostic enum (`INGREDIENT_OVERRIDE_CHANGED`, `AGENT_ACTION_EXECUTED`). The bridge lives in `audit-log/application/types.ts::AuditEventTypeName`. New event types follow this pattern: bus channel = `<bc>.<verb>`, persisted = `UPPER_SNAKE`.
- **Open-enum `event_type` text column** — Postgres `text NOT NULL CHECK (length 1..100)` rather than an enum. Adding a new event type is `+1 constant + 1 @OnEvent handler`; zero migrations. Trade-off: typo resistance is app-side only (TypeScript constants), not DB-enforced.
- **Polymorphic `aggregate_id` (UUID-typed)** — references entities across multiple tables (recipes, ingredients, ai_suggestions, supplier_items, organizations, agent_chat_session). No foreign-key constraint because the column spans tables. App-level guarantee: emitter only fires AFTER the entity exists. The column is **UUID-typed at the DB level** — non-UUID identifiers (free-form session ids, composite keys) MUST be UUID-shaped at emission (use `randomUUID()`) and stored opaquely in `payload_after`. This trips streaming endpoints; ADR-027 codifies the workaround.
- **Hybrid translation** — new event types publish the canonical `AuditEventEnvelope` shape directly (`AI_SUGGESTION_ACCEPTED`, `RECIPE_COST_REBUILT`, `AGENT_ACTION_FORENSIC`); legacy ad-hoc payload events (`INGREDIENT_OVERRIDE_CHANGED`, `RECIPE_ALLERGENS_OVERRIDE_CHANGED`, `RECIPE_SOURCE_OVERRIDE_CHANGED`, `RECIPE_INGREDIENT_UPDATED`, `SUPPLIER_PRICE_UPDATED`, `AGENT_ACTION_EXECUTED` lean) get translated per-type inside the subscriber's handler before persistence. New code MUST emit the envelope shape; legacy translators are scoped to remain until `m2-audit-log-emitter-migration` ships.
- **Subscriber failure mode** — every handler is wrapped in try/catch. A DB or translation failure is logged + dropped; the emitter is never notified. Fire-and-forget bus semantics: services finish their writes regardless of audit success. Worst case is one missing audit row, surfaced for ops via structured-JSON log line.

**Rationale:** Wave 1.9 demonstrated that funnelling 9 event channels into one subscriber decouples audit from business logic. Adding a new event type is a 1-line `@OnEvent` + a constants entry — zero migrations, zero service-code changes. The polymorphic `aggregate_id` keeps the table single rather than per-aggregate; the cost is the loss of a real FK, paid for by an app-level invariant.

**Consequence:**

- New audit event types in M3+ HACCP, inventory, batches add a 1-line constant + 1-line handler. The table shape is fixed.
- Reverse engineering "what changed" for any aggregate is one query: `SELECT * FROM audit_log WHERE aggregate_type = $1 AND aggregate_id = $2 ORDER BY created_at DESC`.
- Querying across BCs by event_type or actor is one query. RBAC at the controller (`Owner+Manager`) gates per-org scope.
- Wave 1.10 retired `recipe_cost_history` (a per-BC audit table); the same retire-on-canonical-arrival pattern applies if any future BC ships its own audit storage in error.

**Alternatives considered:**

- Per-BC audit tables — rejected; the Wave 1.9 backfill from 5 prior BCs (ai_suggestions / recipe_cost_history / ingredients.overrides / recipes.aggregated_allergens_override) demonstrated the pattern was already drifting; consolidation was overdue.
- Postgres enum for `event_type` — rejected; M3+ adds many event types; each enum extension is a migration.
- Per-aggregate-type audit tables — rejected; queries spanning aggregates would need UNION ALL across N tables.

### ADR-026: Forensic agent-event split (this slice)

**Decision:** Split the `AGENT_ACTION_EXECUTED` channel into two distinct event types:

- **`AGENT_ACTION_EXECUTED`** (unchanged channel name) carries the **lean, request-anchored** attribution row emitted by `AgentAuditMiddleware` for every agent-flagged HTTP request. `aggregate_type = 'organization'`. Payload: `{capabilityName, timestamp}` in `payload_after`.
- **`AGENT_ACTION_FORENSIC`** (new channel name `agent.action-forensic`, new persisted event_type `AGENT_ACTION_FORENSIC`) carries the **rich, aggregate-anchored** mutation row emitted by `BeforeAfterAuditInterceptor` for REST writes and by `AgentChatService` for chat turns. `aggregate_type ∈ {recipe, menu_item, ingredient, supplier, supplier_item, agent_chat_session, ...}`. Payload: full `AuditEventEnvelope` with `payload_before` + `payload_after`.

The runtime-shape discrimination via `isRichAuditEnvelope()` in `AuditLogSubscriber.onAgentActionExecuted()` is **deleted**. The subscriber gains a new `@OnEvent(AGENT_ACTION_FORENSIC)` handler that calls `persistEnvelope()` directly. Type-system-level enforcement replaces runtime-shape sniffing.

A backfill migration (`0022_audit_log_forensic_split`) reassigns historical rich rows: `UPDATE audit_log SET event_type = 'AGENT_ACTION_FORENSIC' WHERE event_type = 'AGENT_ACTION_EXECUTED' AND aggregate_type != 'organization'`. The down migration reverses. No schema change is required (the column is open-enum text per ADR-025).

**Rationale:**

- Three call sites — `AgentAuditMiddleware` (lean), `BeforeAfterAuditInterceptor` (rich), `AgentChatService` (rich) — were emitting on one channel. The subscriber's `isRichAuditEnvelope()` discrimination kept things working but obscured the contract: a TypeScript reader staring at `EventEmitter2.emit(AGENT_ACTION_EXECUTED, payload)` cannot tell whether the payload is the lean shape or the rich envelope without reading the subscriber. Compile-time clarity beats runtime sniffing.
- The 3a + 3b retros both filed the split as M3+ tech-debt. Three call sites is the right pressure point to act.
- Open-enum text column means zero schema cost; the only DB-side work is the backfill UPDATE.

**Consequence:**

- Operators with existing dashboards/queries on `event_type='AGENT_ACTION_EXECUTED'` see only lean rows after the migration runs. To recover the previous (mixed) result set, they add `OR event_type='AGENT_ACTION_FORENSIC'`. Documented in the runbook.
- The `BeforeAfterAuditInterceptor`'s emit target changes; the audit envelope shape is unchanged.
- `AgentChatService`'s emit target changes; the streaming-handler emission pattern (Observable terminal callback + `auditEmitted` flag + `randomUUID()` aggregate id) is preserved and codified separately in ADR-027.
- `AuditLogSubscriber` gains one handler, loses one helper (`isRichAuditEnvelope`).

**Alternatives considered:**

- Rename `AGENT_ACTION_EXECUTED` to e.g. `AGENT_REQUEST_RECEIVED` for cleaner semantics on the lean channel — rejected because it would break any historical operator query/dashboard. The lean event keeps its identity; only the rich emissions move.
- Keep the dual-shape channel and harden `isRichAuditEnvelope()` — rejected; type-system clarity is the whole point.
- Backfill optional, leave historical rows mixed — rejected; the runbook would have to document a "consider both event_type values when querying historical agent rows" caveat in perpetuity.

### ADR-027: Streaming-handler audit pattern

**Decision:** Streaming endpoints (NestJS `@Sse()` handlers, `Readable.from(asyncIterable)` HTTP responses, any handler that returns an `Observable` whose downstream consumer emits multiple events) **do not use `BeforeAfterAuditInterceptor`**. Instead the service emits its own audit row from the Observable's terminal callback (success / 5xx / transport error / unsubscribe), guarded by an `auditEmitted` flag so re-entrant termination paths can't double-emit.

The shared `BeforeAfterAuditInterceptor` (`apps/api/src/shared/interceptors/before-after-audit.interceptor.ts`) is a **write-RPC primitive** — it expects exactly one terminal value from the handler's Observable, unwraps the `WriteResponseDto<T>` envelope to capture `payload_after`, and emits the audit event once. For an `@Sse()` handler, `mergeMap`-over-events would emit one audit row per token frame; that is wrong by intent. For a `Readable.from(asyncIterable)` CSV export, the same incompatibility applies.

Streaming-handler audit emissions follow these rules:

1. **Emit the rich envelope on `AGENT_ACTION_FORENSIC`** (post-this-slice channel name) when the handler's terminal callback fires.
2. **Use `randomUUID()` for `aggregate_id`** — the audit_log column is UUID-typed; opaque/free-form session ids stored unmodified will fail the schema constraint silently in unit tests (mocks accept strings) and explosively in INT against real Postgres.
3. **Store the opaque session id in `payload_after.sessionId`** for forensic linkage. Operators can search FTS or filter `payload_after->>'sessionId'` to recover the chat turn from an audit row.
4. **Set `auditEmitted = true` in a closure-captured local before persistence**, so any subsequent terminal callback (e.g. unsubscribe after success) cannot double-emit.
5. **Emit via `EventEmitter2.emitAsync`** (not `emit`) when an INT spec immediately reads `audit_log` after the response — the `@OnEvent` handler is async and the synchronous emit returns before the DB INSERT. The emit-vs-emitAsync read-after-write hazard has been hit twice (Wave 1.11 + 3a) and is a recurring footgun; the pattern must use `emitAsync` for INT-spec correctness.

**Rationale:**

- The 3b retro discovered all five rules in succession through CI failures. The interceptor's `mergeMap` model assumes one terminal value; SSE handlers emit many events with one terminal *event* (the `done` frame). Streaming endpoints are conceptually closer to long-running RPCs whose audit row is "the whole turn happened" rather than "one event happened".
- The UUID-typed `aggregate_id` constraint is the second-most-frequent footgun across the audit-log saga (after emit-vs-emitAsync). Codifying it here avoids a third repeat.

**Consequence:**

- Future streaming endpoints (e.g. CSV export with audit emission, batched CSV import streaming a per-row audit row) follow this pattern. They do **not** add `@AuditAggregate` decorators; they wire emission into the Observable / async-iterable terminal path themselves.
- The `BeforeAfterAuditInterceptor` is unchanged. It remains the canonical primitive for write-RPC handlers (POST/PUT/PATCH/DELETE).
- The `auditEmitted` flag pattern is ~5 LOC per streaming service. Replicate from `agent-chat.service.ts` rather than abstract; the per-service shape varies (chat has session id; CSV export has filename; future BCs may differ).

**Alternatives considered:**

- A streaming-aware variant of `BeforeAfterAuditInterceptor` (e.g. `StreamingAuditInterceptor`) — considered; rejected for now because the per-service shape varies enough that a one-size-fits-all interceptor would either be too generic to be useful or too specific to chat. Revisit if a third streaming endpoint adopts the pattern in M3+.
- Use the lean `AGENT_ACTION_EXECUTED` for chat audit — rejected; chat is a multi-turn mutation, not a single REST request, and forensic linkage to the session id matters for compliance.

## Sub-decisions

These are mid-implementation calls that don't warrant a top-level ADR but should be recorded for the retro.

### SD1 — `AGENT_ACTION_FORENSIC` is a top-level constant in `cost.events.ts`

`cost.events.ts` already houses the cross-BC event constants (despite the `cost/` location — it's the de-facto shared events file). `AGENT_ACTION_EXECUTED` lives there. `AGENT_ACTION_FORENSIC` joins it. A future cleanup could move all agent.* constants to a `shared/agent.events.ts`; not in scope here.

### SD2 — Backfill in a single transaction; no batching

The audit_log row count is small enough (current dev DB has <100 agent rows; PROD post-deploy is similar) that a single `UPDATE` runs in milliseconds. Batched migrations are warranted at >1M-row volumes; not here.

### SD3 — Down-migration is symmetric

`down()` runs `UPDATE audit_log SET event_type='AGENT_ACTION_EXECUTED' WHERE event_type='AGENT_ACTION_FORENSIC'`. The application code rolls back along with the migration — once down runs, the emit-site code reverts (interceptor + chat service emit on the old channel) and the subscriber rejoins the dual-shape pattern. Down is for emergency rollback only; no operator workflow expects to run it.

### SD4 — Operator runbook references rather than re-documents per-slice runbooks

`docs/operations/audit-log-runbook.md` is the cross-cutting consolidation. Per-slice runbooks (`m2-mcp-write-capabilities-runbook.md`, `m2-mcp-agent-chat-widget-runbook.md`, `m2-mcp-agent-registry-bench-runbook.md`) carry slice-specific setup detail (env flags, secret generation, testing recipes). The audit-log runbook references them rather than duplicating; reduces drift surface.

## Test strategy

Unit tests (apps/api):

- `audit-log.subscriber.spec.ts` — add `onAgentActionForensic` happy path + null-org skip + record-failure-swallowed; remove `isRichAuditEnvelope` branch tests; verify lean handler still translates + persists for `aggregate_type='organization'` payloads.
- `before-after-audit.interceptor.spec.ts` — assert emit is on `AGENT_ACTION_FORENSIC` for write paths.
- `agent-chat.service.spec.ts` — assert emit is on `AGENT_ACTION_FORENSIC` from the terminal callback.

INT tests (apps/api, real Postgres):

- `agent-write-capabilities.int.spec.ts` — assertion update: a single agent write produces TWO rows (lean + forensic) with the expected event_type values; `eventTypes=['AGENT_ACTION_FORENSIC']` filter returns the forensic row only.
- `agent-chat.int.spec.ts` — assertion update: the rich row's event_type is `AGENT_ACTION_FORENSIC`.
- `audit-log-migration-0022.int.spec.ts` (NEW) — seed mixed historical rows (some lean, some rich-on-AGENT_ACTION_EXECUTED), run the migration, assert correct reassignment + idempotency on second run + clean down behaviour.

CodeRabbit + Storybook + Gitleaks unchanged from prior slices.

## Out-of-scope follow-ups

- `m2-audit-log-emitter-migration` — migrate the 5 cost.* legacy translators in the subscriber to envelope-shape emitters.
- `m2-audit-log-partition` — partition `audit_log` by `created_at` month at >10M rows/org.
- `m2-audit-log-dlq` — dead-letter queue for failed audit writes.
- `m2-audit-log-forensic-channel-rename` — if a future ADR decides `AGENT_ACTION_EXECUTED` should rename to `AGENT_REQUEST_RECEIVED`, that ships in its own slice with operator-side renames documented.
- `m2-audit-log-ui` — Owner-facing browse / search / drill-down UI for `audit_log`.
