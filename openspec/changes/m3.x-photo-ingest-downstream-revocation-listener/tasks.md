# Tasks — m3.x-photo-ingest-downstream-revocation-listener

## §1 Audit-log types extension

- [x] Add `LOT_FLAGGED_FOR_REVIEW`, `GR_FLAGGED_FOR_REVIEW`, `DOWNSTREAM_REVOCATION_DEFERRED` to `AuditEventType` (apps/api/src/audit-log/application/types.ts).
- [x] Add 3 entries to `AuditEventTypeName` map.
- [x] Add 3 entries to `RETENTION_BY_EVENT_NAME` map (all `regulatory`).
- [x] Add 3 entries to `types.spec.ts` regulatory `it.each` list.

## §2 AuditLogSubscriber extension

- [x] Add 3 new `@OnEvent` handlers (`onLotFlaggedForReview`, `onGrFlaggedForReview`, `onDownstreamRevocationDeferred`) all calling `persistEnvelope` — extends the single subscriber per ADR-SUBSCRIBER-FAN-OUT.

## §3 PhotoIngestionRevocation BC

- [x] `apps/api/src/photo-ingestion-revocation/photo-ingestion-revocation.module.ts`.
- [x] `application/downstream-revocation.repository.ts` — `flagLotsBySourcePhotoIngestion` + `flagGoodsReceiptsBySourcePhotoIngestion`, raw SQL UPDATE with RETURNING id, `42703` graceful probe.
- [x] `application/downstream-revocation.subscriber.ts` — `@OnEvent(HITL_RETROACTIVE_CORRECTION)` invokes both probes, emits one envelope per matched row, emits DEFERRED on `columnExists: false`.

## §4 App-module wiring

- [x] Import + register `PhotoIngestionRevocationModule` in `apps/api/src/app.module.ts` after `PhotoIngestionRoutingModule`.

## §5 Unit specs

- [x] `downstream-revocation.subscriber.spec.ts` — 8 cases: 1 lot, 1 GR, both, no match, lots column missing → short-circuit, GR column missing, invalid envelope shape skip, repo throw swallow.
- [x] `downstream-revocation.repository.spec.ts` — 7 cases across both methods: column-exists happy + empty + 42703 top-level + 42703 driverError-nested + non-42703 rethrow + goods_receipts targets correct table + 42703 symmetric.

## §6 Local gates

- [ ] CI typecheck + lint pass.
- [ ] CI Test job passes — 15 new unit cases.
- [ ] CI Integration job stays green (no INT change in this slice; H2a + H2b suites still PASS per F3 + F4 outcomes).

## Deferred

- `m3.x-photo-ingest-revocation-int` — testcontainer INT spec exercising the SQL path against migration 0041.
- `m3.x-operator-review-queue-ui` — j-screen surfacing `requires_review=true` aggregates.
- `m3.x-requires-review-clear-cron` — periodic cron flipping the flag back after manual reconciliation.
- `m3.x-correction-burst-alarms` — observability for >5 corrections/item/hour (H1b followup).
