# m3.x-photo-ingest-downstream-revocation-listener

## Problem

H1b PR #152 `m3-photo-ingest-retroactive-correction-handler` shipped the producer side (operator endpoint + service + audit envelope `HITL_RETROACTIVE_CORRECTION`) but deferred the listener that wires the envelope into the downstream Lot / GR-draft snapshots. The schema landed via migration 0041 (`requires_review` BOOL + partial indexes on `lots` + `goods_receipts`), but nothing flips those flags today — a retroactive correction is audit-recorded with no downstream side effect.

## Proposal

New BC `apps/api/src/photo-ingestion-revocation/` listening on `HITL_RETROACTIVE_CORRECTION`:

- `DownstreamRevocationRepository` — raw SQL `UPDATE` against `lots` and `goods_receipts`, gated on `organizationId` + `source_photo_ingestion_id`, with graceful Postgres `42703` (`undefined_column`) probe per ADR-COLUMN-EXISTS-GRACEFUL-PROBE. Returns `{ columnExists: true, flaggedRowIds: [] }` or `{ columnExists: false }`.
- `DownstreamRevocationSubscriber` — `@OnEvent(AuditEventType.HITL_RETROACTIVE_CORRECTION)`. Probes both tables, emits one envelope per flagged row + a `DOWNSTREAM_REVOCATION_DEFERRED` envelope when either probe surfaces `42703` (deployment hasn't run migration 0041). Wraps everything in try/catch — chain of custody is preserved even on transient repository failure.
- 3 new `AuditEventType` constants + name map + retention map (all `regulatory`) + 3 new `@OnEvent` handlers on the single `AuditLogSubscriber`:
  - `LOT_FLAGGED_FOR_REVIEW` (aggregateType=`lot`, aggregateId=`<lotId>`)
  - `GR_FLAGGED_FOR_REVIEW` (aggregateType=`goods_receipt`, aggregateId=`<grId>`)
  - `DOWNSTREAM_REVOCATION_DEFERRED` (aggregateType=`photo_ingestion_item`, aggregateId=`<itemId>`)

## ADRs (referenced; declared in H1b design.md)

- **NEVER-AUTO-CASCADE-DOWNSTREAM**: this subscriber NEVER mutates the downstream aggregate's snapshot. It only flags. Operator must review and reconcile manually via the future review-queue surface (`m3.x-operator-review-queue-ui`, separate followup).
- **COLUMN-EXISTS-GRACEFUL-PROBE**: missing column → `DOWNSTREAM_REVOCATION_DEFERRED` envelope, never a mid-event throw. Lets the listener BC compile-time depend on H1a's migration 0040 schema without a hard runtime dependency.
- **SUBSCRIBER-FAN-OUT** (slice #21): all audit-log writes go through the SINGLE `AuditLogSubscriber`; this BC emits envelopes, never persists directly.
- **CROSS-BC-SUBSCRIBER-LOCATION** (slice #21): bus consumers live in their own BC, not in the producer's.

## FR mapping

Closes the FR28-FR31 chain-of-custody hole for retroactive corrections: previously a retro-correction audit was orphaned downstream; now it raises a regulator-visible flag on every affected Lot / GR draft.

## Out of scope

- Operator "review queue" widget surfacing `requires_review=true` aggregates → followup `m3.x-operator-review-queue-ui`.
- Cleanup cron flipping `requires_review` back to `false` after manual reconciliation → followup `m3.x-requires-review-clear-cron`.
- Auto-mutation of the downstream snapshot — barred by compliance (`NEVER-AUTO-CASCADE-DOWNSTREAM`).
- Burst-correction alarming (>5 corrections/item/hour) → tracked in H1b's existing `m3.x-correction-burst-alarms` followup.
- Per-org policy on revocation behaviour → assume "always-flag".
- INT spec with real Postgres → followup `m3.x-photo-ingest-revocation-int`.
