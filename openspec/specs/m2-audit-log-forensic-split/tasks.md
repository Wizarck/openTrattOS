# Tasks: m2-audit-log-forensic-split

> Wave 1.14. 6 stages, single PR. Each stage is a single commit; all green locally before pushing.

## Stage 1 — Canonical ADRs in `master/docs/architecture-decisions.md`

- [ ] Append ADR-025 (audit_log canonical architecture) to `master/docs/architecture-decisions.md`
- [ ] Append ADR-026 (Forensic agent-event split) — referencing this slice as its concrete change
- [ ] Append ADR-027 (Streaming-handler audit pattern) — referencing the 3b chat path as the canonical example
- [ ] Verify the existing ADR-001 → ADR-024 format is preserved (Decision / Rationale / Consequence / Alternatives sections)

## Stage 2 — Type-system split in shared events

- [ ] `apps/api/src/audit-log/application/types.ts`:
  - Add `AGENT_ACTION_FORENSIC: 'agent.action-forensic'` to the `AuditEventType` constants.
  - Add the persisted-name mapping `'agent.action-forensic': 'AGENT_ACTION_FORENSIC'` to `AuditEventTypeName`.
- [ ] `apps/api/src/cost/application/cost.events.ts`:
  - Add `AGENT_ACTION_FORENSIC = 'agent.action-forensic'` channel constant.
  - Export the `AgentActionForensicEvent` type alias = `AuditEventEnvelope` (re-export from audit-log/application/types if cleaner; verify import cycles).
- [ ] Compile-check: build passes locally.

## Stage 3 — Subscriber + emit-site refactor

- [ ] `apps/api/src/audit-log/application/audit-log.subscriber.ts`:
  - Add `@OnEvent(AuditEventType.AGENT_ACTION_FORENSIC) onAgentActionForensic(payload: AuditEventEnvelope) { return persistEnvelope(...) }`.
  - Strip the `isRichAuditEnvelope` branch from `onAgentActionExecuted`. The handler becomes lean-only; the legacy translator path stays.
  - Delete the `isRichAuditEnvelope()` helper from the file.
- [ ] `apps/api/src/shared/interceptors/before-after-audit.interceptor.ts`:
  - Change the `events.emit(AGENT_ACTION_EXECUTED, envelope)` call to `events.emit(AGENT_ACTION_FORENSIC, envelope)`.
  - Verify no other code path in the interceptor still references `AGENT_ACTION_EXECUTED`.
- [ ] `apps/api/src/agent-chat/application/agent-chat.service.ts`:
  - Change the terminal-callback emit from `AGENT_ACTION_EXECUTED` to `AGENT_ACTION_FORENSIC`.
  - Preserve `auditEmitted` flag + `randomUUID()` aggregate id semantics.
- [ ] `apps/api/src/shared/middleware/agent-audit.middleware.ts`:
  - **No change.** The lean middleware keeps emitting `AGENT_ACTION_EXECUTED` on the existing channel.
- [ ] grep audit: confirm no remaining emit site sends a rich envelope on the lean channel:
  ```
  grep -rn "emit.*AGENT_ACTION_EXECUTED" apps/api/src
  ```
  Only the lean middleware should match. Document the grep in the commit message.

## Stage 4 — Backfill migration

- [ ] `apps/api/src/migrations/0022_audit_log_forensic_split.ts`:
  - `up()`:
    ```ts
    if (!(await q.hasTable('audit_log'))) return;
    await q.query(`UPDATE audit_log
                   SET event_type = 'AGENT_ACTION_FORENSIC'
                   WHERE event_type = 'AGENT_ACTION_EXECUTED'
                     AND aggregate_type != 'organization'`);
    ```
  - `down()`:
    ```ts
    if (!(await q.hasTable('audit_log'))) return;
    await q.query(`UPDATE audit_log
                   SET event_type = 'AGENT_ACTION_EXECUTED'
                   WHERE event_type = 'AGENT_ACTION_FORENSIC'`);
    ```
  - Class name + filename follow the established pattern (`0022_audit_log_forensic_split.ts`, exported class `AuditLogForensicSplit0022`).
- [ ] No entity changes (open-enum text column).

## Stage 5 — Tests adapted + new INT spec

- [ ] `apps/api/src/audit-log/application/audit-log.subscriber.spec.ts`:
  - Add 3 unit tests for `onAgentActionForensic`:
    - happy path: persistEnvelope called once with the input envelope (no translation).
    - missing-required-fields skipped with warning.
    - record() failure swallowed without re-throwing.
  - Remove the `isRichAuditEnvelope` discrimination tests from `onAgentActionExecuted`.
  - Verify the lean translator path still produces `aggregate_type='organization'` rows.
- [ ] `apps/api/src/shared/interceptors/before-after-audit.interceptor.spec.ts`:
  - Update emit-target assertion: `expect(emit).toHaveBeenCalledWith(AGENT_ACTION_FORENSIC, envelope)`.
- [ ] `apps/api/src/agent-chat/application/agent-chat.service.spec.ts`:
  - Update emit-target assertion: terminal callback emits on `AGENT_ACTION_FORENSIC`.
- [ ] `apps/api/src/shared/agent-write-capabilities.int.spec.ts`:
  - Assert two distinct rows per agent write: one with `event_type='AGENT_ACTION_EXECUTED' AND aggregate_type='organization'`, one with `event_type='AGENT_ACTION_FORENSIC' AND aggregate_type IN (...)`.
  - Update any `eventTypes=['AGENT_ACTION_EXECUTED']` filter expectations to include `AGENT_ACTION_FORENSIC` where the test expected the rich row.
- [ ] `apps/api/src/agent-chat/agent-chat.int.spec.ts`:
  - Update the existing audit-row assertion: the row's `event_type` is `AGENT_ACTION_FORENSIC` (was `AGENT_ACTION_EXECUTED`).
- [ ] `apps/api/src/audit-log/audit-log-migration-0022.int.spec.ts` (NEW):
  - Seed 4 rows: 2 lean (`AGENT_ACTION_EXECUTED` + `aggregate_type='organization'`) + 2 rich (`AGENT_ACTION_EXECUTED` + `aggregate_type='recipe'`).
  - Run `up()`; assert lean rows untouched, rich rows reassigned to `AGENT_ACTION_FORENSIC`.
  - Run `up()` again; assert idempotency (no rows change because the WHERE clause matches nothing).
  - Run `down()`; assert reverse correctness (rich rows back to `AGENT_ACTION_EXECUTED`).
  - Use the existing INT spec scaffolding from `audit-log-fts.int.spec.ts` for the Postgres bootstrap.

## Stage 6 — Operator runbook

- [ ] `master/docs/operations/audit-log-runbook.md` (NEW):
  - Section 1: Schema overview (`audit_log` table 14 columns, 3 b-tree indexes, 2 GIN FTS indexes; reference migration 0017 + 0019).
  - Section 2: Query API (`GET /audit-log` filters, RBAC `Owner+Manager`, default 30-day window, default 50 rows, max 200).
  - Section 3: Full-text search (`?q=` behaviour, dual-config Spanish + English, ranking via `GREATEST(ts_rank_es, ts_rank_en) DESC`).
  - Section 4: CSV export (`GET /audit-log/export.csv`, hard cap 100K, `X-Audit-Log-Export-Truncated` header, RFC 4180 escaping).
  - Section 5: Agent dual-channel emission (post-this-slice):
    - `AGENT_ACTION_EXECUTED` lean from `AgentAuditMiddleware` for every agent-flagged HTTP request.
    - `AGENT_ACTION_FORENSIC` rich from `BeforeAfterAuditInterceptor` (write RPCs) and `AgentChatService` (chat turns).
    - Migration 0022 backfilled historical rich rows; queries with `event_type='AGENT_ACTION_EXECUTED'` now return only lean rows. Operator action: add `OR event_type='AGENT_ACTION_FORENSIC'` to recover the previous mixed result set.
  - Section 6: Troubleshooting recipes (≥5):
    - **R1** "I see only lean rows for an agent write" — verify `BeforeAfterAuditInterceptor` is wired via `APP_INTERCEPTOR` in the controller's module; check `req.user.organizationId` is populated upstream.
    - **R2** "FTS returns no results despite obvious match" — query `pg_indexes` for `ix_audit_log_fts_es` + `_en`; verify the indexed expression matches the queried expression (drift → seq scan fallback).
    - **R3** "CSV export truncated at 100K" — confirm `X-Audit-Log-Export-Truncated: true` in response headers; consider filing `m2-audit-log-export-async`.
    - **R4** "Migration 0022 didn't move my rows" — run `SELECT event_type, aggregate_type, count(*) FROM audit_log WHERE event_type LIKE 'AGENT_ACTION_%' GROUP BY 1,2`; the rich rows should have `aggregate_type != 'organization'`.
    - **R5** "Audit row drops silently" — `grep "audit-log.subscriber" <log-stream>` for the structured-JSON error log; the row was log + drop per ADR-025. DLQ (`m2-audit-log-dlq`) is filed but not implemented.
    - **R6** "Streaming endpoint emits N audit rows for one turn" — the endpoint is misusing `BeforeAfterAuditInterceptor`. Per ADR-027, streaming handlers emit from the Observable terminal callback with `auditEmitted` flag. Refactor pattern in `agent-chat.service.ts`.
  - Section 7: Cross-references — per-slice runbooks for setup detail (`m2-mcp-write-capabilities-runbook.md`, `m2-mcp-agent-chat-widget-runbook.md`, `m2-mcp-agent-registry-bench-runbook.md`).
  - Section 8: Future tech-debt — `m2-audit-log-emitter-migration`, `m2-audit-log-partition`, `m2-audit-log-dlq`, `m2-audit-log-export-async`, `m2-audit-log-ui`.

## Verification before push

- [ ] `pnpm --filter apps/api build` clean
- [ ] `pnpm --filter apps/api lint` clean
- [ ] `pnpm --filter apps/api test --runInBand` green (≥792 tests pre-this-slice; net positive after additions)
- [ ] `pnpm test` (root) clean across workspaces
- [ ] grep `AGENT_ACTION_EXECUTED` shows no remaining emit-site for rich envelopes
- [ ] grep `isRichAuditEnvelope` returns no results in apps/api/src

## PR + Gate F

- [ ] Single PR `proposal(m2-audit-log-forensic-split): split AGENT_ACTION_EXECUTED + audit-log canonical ADRs (Wave 1.14)`
- [ ] Body lists the 6 stages + the 3 ADRs by id
- [ ] CI green (build / lint / test / Storybook / Gitleaks / CodeRabbit)
- [ ] Squash-merge after CR clean
- [ ] `chore(m2-audit-log-forensic-split): archive + retro (Gate F closed; Wave 1.14 — audit-log saga consolidated)` follow-up
- [ ] Update `project_m1_state.md` memory + MEMORY.md index
