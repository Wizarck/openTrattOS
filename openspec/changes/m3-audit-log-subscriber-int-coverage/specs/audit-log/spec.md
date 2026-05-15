## ADDED Requirements

### Requirement: AuditLogSubscriber fan-out matrix INT coverage

The system SHALL ship integration-grade test coverage that emits a representative envelope for every `AuditEventType` channel wired in `AuditLogSubscriber` against a real Postgres + `EventEmitter2`, and asserts the resulting `audit_log` row carries the correct `event_type`, `aggregate_type`, `actor_kind`, and `retention_class`.

#### Scenario: AC-INT-1 — every M2 + M3 event type persists exactly one row

- **WHEN** an integration spec iterates the 46 event types enumerated in `AuditEventType` (10 M2 + 36 M3, including the 7 photo-ingestion channels and the shared-channel `LOT_EXPIRY_NEAR`) and emits a representative envelope on each producing channel via `emitter.emitAsync()`
- **THEN** for each event type exactly one `audit_log` row persists with `event_type` matching the `AuditEventTypeName` mapping (or `'LOT_EXPIRY_NEAR'` for the shared-channel case), `organization_id` matching the envelope, and `retention_class` matching `computeRetentionClass(eventTypeName)`

#### Scenario: AC-INT-3 — DB CHECK rejects unknown retention class

- **WHEN** the integration spec attempts to INSERT an `audit_log` row with `retention_class='unknown'` via raw `dataSource.query()`
- **THEN** Postgres rejects the INSERT with a CHECK constraint violation (migration 0024 `audit_log_retention_class_check`)

#### Scenario: AC-INT-6 — translator paths cover lean + GR shapes

- **WHEN** `AGENT_ACTION_EXECUTED` is emitted with a populated `organizationId` field
- **THEN** the subscriber's lean translator path persists one row with `aggregate_type='organization'`, `aggregate_id=organizationId`, `actor_kind='agent'`

- **WHEN** `AGENT_ACTION_EXECUTED` is emitted without `organizationId` (pre-auth probe)
- **THEN** no row persists and the subscriber emits a debug log

- **WHEN** `GR_CONFIRMED` is emitted with the producer shape `{ grId, organizationId, lines, … }`
- **THEN** the subscriber's translator persists one row with `aggregate_type='goods_receipt'`, `aggregate_id=grId`, and `payload_after` carrying the full producer payload

### Requirement: AuditLogSubscriber multi-tenant isolation INT coverage

The system SHALL ship integration-grade test coverage that emits the same event type concurrently from two or more distinct `organization_id` values and asserts no cross-tenant row leakage.

#### Scenario: AC-INT-2 — concurrent emit from two orgs

- **WHEN** orgs A and B each emit `RECIPE_INGREDIENT_UPDATED` concurrently (`Promise.all([emitForOrgA, emitForOrgB])`)
- **THEN** two `audit_log` rows persist, one per `organization_id`; a fetch scoped to org A returns only org-A rows; a fetch scoped to org B returns only org-B rows

#### Scenario: same aggregate UUID across two orgs persists two rows

- **WHEN** orgs A and B both emit `RECIPE_INGREDIENT_UPDATED` with the same `aggregateId` UUID concurrently
- **THEN** the LRU dedup key namespace does NOT collapse the two emits; two rows persist (one per `organization_id`)

#### Scenario: 10-org fan-out preserves isolation

- **WHEN** 10 distinct orgs each emit 5 events of varying types concurrently
- **THEN** exactly 50 `audit_log` rows persist; per-org row count is 5; no row carries the wrong `organization_id`

### Requirement: AuditLogSubscriber idempotency LRU dedup INT coverage

The system SHALL ship integration-grade test coverage proving that the in-process LRU cache (`AuditLogIdempotencyCache`, capacity 10 000, TTL 1 h) dedupes identical envelopes when wired to a real Postgres-backed `AuditLogService.record()`.

#### Scenario: AC-INT-4 — identical envelope emitted twice produces one row

- **WHEN** the same `AuditEventEnvelope` is emitted twice in quick succession (within the LRU TTL window) on the same channel
- **THEN** exactly one `audit_log` row persists; the second call short-circuits via `idempotencyCache.shouldDedup()`

#### Scenario: payload-content divergence breaks dedup

- **WHEN** two envelopes are emitted with the same `eventType` and `aggregateId` but distinct `payloadAfter` content (so their SHA-256 hashes differ)
- **THEN** two `audit_log` rows persist

#### Scenario: correlation_id overrides payload hash

- **WHEN** two envelopes are emitted with the same `eventType`, `aggregateId`, and `payloadAfter` but distinct `payloadAfter.correlation_id` values
- **THEN** two `audit_log` rows persist (the correlation_id wins as the dedup-key tail per `extractCorrelationId()`)

#### Scenario: LRU capacity bound is enforced

- **WHEN** 10 005 distinct envelopes are emitted (each with a unique payload)
- **THEN** all 10 005 rows persist AND the in-process cache size stays ≤ 10 000 (LRU eviction triggered)

### Requirement: AuditLogSubscriber resilience INT coverage

The system SHALL ship integration-grade test coverage proving handler-level try/catch swallowing per ADR-AUDIT-WRITER: a transient failure in one handler MUST NOT propagate to the emitter or block subsequent handlers.

#### Scenario: AC-INT-5 — translator throw is swallowed

- **WHEN** `GR_CONFIRMED` is emitted with a malformed payload (`{}`, missing `organizationId` and `grId`) so `translateGrPayload()` throws
- **THEN** the emitter's `emitAsync()` promise resolves successfully, no row persists, an error log entry is emitted, AND a subsequent well-formed `GR_CONFIRMED` emit produces a row normally

#### Scenario: DB write failure is swallowed

- **WHEN** `AuditLogService.record()` throws on a single emit (simulated via one-shot spy)
- **THEN** the emitter's `emitAsync()` promise resolves successfully, no row persists from the failing emit, an error log entry is emitted, AND a subsequent emit (after `record` is restored) produces a row normally

#### Scenario: envelope validation null skip is non-fatal

- **WHEN** an envelope missing `actorKind` is emitted (so `validateEnvelope()` returns `null`)
- **THEN** the emitter's `emitAsync()` promise resolves successfully, no row persists, a warn log entry is emitted, AND a subsequent valid emit succeeds
