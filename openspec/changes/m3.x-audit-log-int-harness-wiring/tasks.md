# Tasks — m3.x-audit-log-int-harness-wiring

## §1 Diagnosis

- [x] Identify why H2a INT suites all received 0 persisted rows.
- [x] Confirm root cause: `audit_log.actor_user_id` is UUID-typed; tests passed `'user-1'` etc.; Postgres rejected; subscriber try/catch swallowed.

## §2 Fix

- [x] `audit-log-subscriber-idempotency.int.spec.ts` — remove `describe.skip`, define `TEST_USER_ID` UUID, replace 5 `'user-1'` references.
- [x] `audit-log-subscriber-fan-out.int.spec.ts` — remove `describe.skip`, define `TEST_USER_ID`, replace 1 `actorUserId: 'user-1'` + 2 `executedBy: 'user-1'`.
- [x] `audit-log-subscriber-multi-tenant.int.spec.ts` — remove `describe.skip`, define `USER_A` + `USER_B` UUIDs, replace 1 `'user-A'` + 1 `'user-B'`.
- [x] `audit-log-subscriber-resilience.int.spec.ts` — remove `describe.skip` only (no UUID issues; spec already used `actorUserId: null` everywhere).

## §3 Local gates

- [x] All 4 suites unmasked; previously skipped describes are now active.
- [ ] CI Integration job passes (verified post-merge against test Postgres).

## Deferred

- `m3.x-audit-log-subscriber-strict-mode` — decide whether AuditLogSubscriber should expose a strict-mode flag that rethrows DB rejection errors (today's silent swallow per ADR-AUDIT-WRITER hid this bug for the whole H2a wave). If adopted, integration tests would opt into strict mode and see fixture errors immediately instead of via the "0 rows" symptom.
