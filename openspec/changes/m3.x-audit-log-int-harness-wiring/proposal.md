# m3.x-audit-log-int-harness-wiring

## Problem

The 4 INT suites shipped (describe.skip'd) by H2a `m3-audit-log-subscriber-int-coverage` (PR #149) silently failed every test — `fetchRows` returned 0 rows after every `emitAndWait`. The skip-comment hypothesised that `@OnEvent` decorators weren't registering under the TestingModule harness, but the real cause was different.

## Root cause

`audit_log.actor_user_id` is a `uuid`-typed Postgres column (`apps/api/src/audit-log/domain/audit-log.entity.ts:48`). The harness test fixtures passed `actorUserId: 'user-1'` (and variants `'user-A'`, `'user-B'`) — non-UUID strings. Postgres rejected the INSERT with `invalid input syntax for type uuid`. The `AuditLogSubscriber.persistEnvelope` wraps `auditLog.record` in try/catch and logs without rethrowing (per ADR-AUDIT-WRITER), so the failure was invisible to the test. Result: 0 rows persisted, every assertion red.

`AGENT_ACTION_EXECUTED` is also affected via its translator — `actorUserId: event.executedBy`, so `executedBy: 'user-1'` had the same fate.

## Proposal

Two-line change per spec file:

1. Remove the `describe.skip` + SKIP comment block on each of the 4 suites.
2. Replace every `'user-1'`, `'user-A'`, `'user-B'` literal with a hex-format UUID constant (`TEST_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'`, `USER_A`, `USER_B`).

Zero production-code change. Zero migration. Zero harness change.

## FR mapping

Closes the AC-INT-1 through AC-INT-6 coverage gap that H2a's PR body claimed but every test silently failed.

## Out of scope

- Whether `AuditLogSubscriber` should rethrow (vs swallow) on UUID-type DB rejection. Filed `m3.x-audit-log-subscriber-strict-mode` to decide whether tests should observe the rejection (with `throwOnInsertFailure?: boolean` constructor flag).
- INT spec for the `*_INVOICE_PHOTO_ENABLED` kill-switch path.
