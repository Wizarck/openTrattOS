# Design — m3-audit-log-subscriber-int-coverage

## Context

Wave 2.3 slice #21 (`m3-audit-log-hash-chain-hardening`) wired the canonical `AuditLogSubscriber` with @OnEvent handlers for every M3 event type. Subsequent slices (#13 recall, #9 HACCP, #14 APPCC export, #17a photo ingestion, #18 photo storage, #19 AI budget tier) extended the class to its current 30+ handler count. Each slice ships its own unit specs that mock `AuditLogService.record()`. No spec exercises the wired bus end-to-end against a real Postgres with the real LRU dedup, the DB CHECK constraint on `retention_class` (migration 0024), and the multi-tenant `organization_id` predicates that drive RLS-equivalent isolation.

This is H2a in the M3 hardening wave. H2b is hash-chain INT coverage (sibling slice).

## ADR-INT-HARNESS-PATTERN

**Decision**: build a single shared harness module under `apps/api/src/audit-log/application/__helpers__/audit-log-int-harness.ts` that all four new INT specs import. The harness owns the TestingModule construction, the DataSource lifecycle, the per-test TRUNCATE, and the `emitAndWait()` helper.

**Rationale**: each producing slice ships its own INT spec patterns for its own BC (cost, inventory, procurement, recall, HACCP, …). The audit-log subscriber sits across all of them. Without a shared harness, the four new specs would duplicate the TypeORM bootstrap + EventEmitterModule wiring + truncate logic. The harness centralises this so future M4+ subscribers can extend with one more spec instead of one more bootstrap.

**Shape**:

```ts
export interface AuditLogIntHarness {
  app: TestingModule;
  dataSource: DataSource;
  service: AuditLogService;
  subscriber: AuditLogSubscriber;
  cache: AuditLogIdempotencyCache;
  emitter: EventEmitter2;
  truncate(): Promise<void>;
  emitAndWait(channel: string, payload: unknown): Promise<void>;
  fetchRows(orgId: string): Promise<AuditLog[]>;
}
export async function createAuditLogIntHarness(): Promise<AuditLogIntHarness>;
```

**Alternative rejected**: duplicate the bootstrap across each INT spec (per the existing `audit-log-fts.int.spec.ts` + `audit-log-export.int.spec.ts` pattern). Rejected because those specs hit only `AuditLogService` directly; they don't need EventEmitter2 + subscriber wiring, which is the new complexity this slice introduces.

## ADR-FAN-OUT-MATRIX-COVERAGE

**Decision**: the fan-out matrix spec covers every `AuditEventType` value enumerated in `apps/api/src/audit-log/application/types.ts` plus the `LOT_EXPIRY_NEAR` shared-channel name. Each test emits a representative envelope and asserts the resulting `audit_log` row has the correct `event_type` + `retention_class` + envelope fields preserved.

**Coverage list** (30 channels — count matches the subscriber's `@OnEvent` decorators):

- M2 (10): `AI_SUGGESTION_ACCEPTED`, `AI_SUGGESTION_REJECTED`, `RECIPE_COST_REBUILT`, `INGREDIENT_OVERRIDE_CHANGED`, `RECIPE_ALLERGENS_OVERRIDE_CHANGED`, `RECIPE_SOURCE_OVERRIDE_CHANGED`, `RECIPE_INGREDIENT_UPDATED`, `SUPPLIER_PRICE_UPDATED`, `AGENT_ACTION_EXECUTED`, `AGENT_ACTION_FORENSIC`.
- M3 inventory (4): `LOT_CREATED`, `STOCK_MOVE_CREATED`, `LOT_CONSUMED`, `LOT_EXPIRY_NEAR` (via shared `audit.event` channel).
- M3 cost (1): `COST_SNAPSHOT_RECORDED`.
- M3 PO (6): `PO_CREATED`, `PO_SENT`, `PO_RECEIVED_PARTIAL`, `PO_RECEIVED_FULL`, `PO_CANCELLED`, `PO_CLOSED`.
- M3 GR (3): `GR_CONFIRMED`, `GR_LINE_QTY_VARIANCE`, `GR_LINE_PRICE_VARIANCE`.
- M3 shared (2): `EMAIL_DISPATCHED`, `EMAIL_FAILED`.
- M3 photo storage (2): `PHOTO_UPLOADED`, `PHOTO_DELETED`.
- M3 AI obs (1): `AI_BUDGET_TIER_CROSSED`.
- M3 recall (5): `RECALL_INVESTIGATION_OPENED`, `RECALL_86_FLAG_DISPATCHED`, `RECALL_DOSSIER_GENERATED`, `RECALL_DOSSIER_REDISPATCHED`, `RECALL_ADDENDUM_ATTACHED`.
- M3 HACCP (3): `CCP_READING_RECORDED`, `CCP_CORRECTIVE_ACTION_RECORDED`, `FSMS_STANDARD_CONFIGURED`.
- M3 APPCC export (2): `EXPORT_BUNDLE_GENERATED`, `EXPORT_BUNDLE_DISPATCHED`.
- M3 photo ingestion (7): `PHOTO_INGESTION_AUTO_FILLED`, `PHOTO_INGESTION_AWAITING_REVIEW`, `PHOTO_INGESTION_REJECTED_LOW_CONFIDENCE`, `PHOTO_EXTRACTION_FAILED`, `PHOTO_INGESTION_SIGNED`, `PHOTO_INGESTION_RECLASSIFIED`, `HITL_RETROACTIVE_CORRECTION`.

That's 46 distinct event types. The fan-out spec iterates a parametrised list and tests each one's persistence shape.

**Special-case paths**:

- `AGENT_ACTION_EXECUTED` (lean translator path): emit with `organizationId` set → row persists with `aggregate_type='organization'`; emit without `organizationId` → no row, debug log only.
- `GR_CONFIRMED` (translator path): producer-shape with `grId` → row persists with `aggregate_type='goods_receipt'` and `aggregate_id=grId`.
- `LOT_EXPIRY_NEAR` (shared `audit.event` channel, `persistDirect`): emit on `audit.event` with envelope → row persists with `event_type='LOT_EXPIRY_NEAR'` (NOT the channel name).

## ADR-MULTI-TENANT-CONCURRENT-EMIT

**Decision**: the multi-tenant spec verifies isolation via `Promise.all([emitForOrgA, emitForOrgB, …])` patterns. After the emits resolve, fetch rows for each org separately and assert (a) each org sees only its own rows, (b) total row count equals the emit count, (c) no row has the wrong `organization_id`.

**Why concurrent**: a serial test could pass even if the subscriber had a sneaky global state bug. Concurrent emit on the same channel exercises the `emitAsync` ordering guarantee and the LRU cache key namespace — the dedup key is `(eventType, aggregateId, payloadHashOrCorrelationId)`, NOT keyed on `organizationId` directly. We verify that two different orgs emitting the SAME aggregate id (theoretically possible because UUIDs are per-tenant) DO produce two distinct rows.

**Realistic stress**: 10 orgs × 5 events each = 50 concurrent emits. Bounded so the test stays under 10s; larger stress is a separate (out-of-scope) load test.

## ADR-IDEMPOTENCY-LRU-WINDOW

**Decision**: the idempotency spec uses the production-config LRU (10K capacity, 1h TTL — `AuditLogIdempotencyCache` constructed with no opts). The spec verifies:

1. **Hit**: emit envelope X → persist; emit identical envelope X again immediately → no second row.
2. **Miss after payload change**: emit envelope X → persist; emit envelope X' (same `eventType` + `aggregateId`, different `payloadAfter`) → second row persists.
3. **Miss after correlation_id divergence**: emit envelope with `payloadAfter.correlation_id='a'` → persist; emit with `correlation_id='b'` → second row persists.
4. **Capacity eviction smoke**: emit > 10K distinct envelopes; the cache stays bounded; eviction is LRU.

**Test seam for capacity**: the harness exposes the cache instance so the spec can inspect `cache.size()`. Capacity test uses 10_005 emits to confirm eviction triggers — this takes ~1s against test Postgres so it stays within the 30s `testTimeout`.

**TTL is NOT exercised by INT**: TTL would require time mocking (`nowFn`), which the unit spec already covers (`audit-log-idempotency.spec.ts`). INT scope is the wiring + capacity. Time-based eviction is out of scope.

## ADR-RESILIENCE-SWALLOW

**Decision**: the resilience spec verifies that handler-level try/catch (`persistEnvelope` + `persistTranslated` + `persistDirect`) swallows errors per ADR-AUDIT-WRITER. Two scenarios:

1. **Translator throws**: emit `GR_CONFIRMED` with a malformed payload (missing `grId`); the translator throws inside `translateGrPayload`; the subscriber logs + returns; the emitter's promise resolves; subsequent emits to the same channel still succeed.
2. **DB write fails transiently**: bring up an isolated harness with a connection that refuses writes (or wrap `service.record` with a one-shot throw); emit envelope; the subscriber logs + returns; the emitter's promise resolves; subsequent emits succeed.

For scenario 2, the cleanest approach is to swap out the `service.record` method on the harness instance for one emit's worth, then restore. This avoids needing a flaky network test seam.

**Why both scenarios**: scenario 1 covers the translator branch; scenario 2 covers the `repo.save()` branch. Both share the same try/catch wrapper but originate at different stages of the handler.

## ADR-NO-SCHEMA-CHANGE

**Decision**: this slice is pure test addition. Zero migration. Zero entity change. Zero column add.

**Why explicit ADR**: the temptation to "while we're here, add a CHECK on event_type" is real. Resisted — the open-set event type design (per ADR-025) is load-bearing; tightening it would force every future M4+ slice to migrate before adding a new event. The current `text NOT NULL` + length check is the right shape.

## Test layout

```
apps/api/src/audit-log/application/
├── __helpers__/
│   └── audit-log-int-harness.ts          (NEW)
├── audit-log-subscriber-fan-out.int.spec.ts        (NEW)
├── audit-log-subscriber-multi-tenant.int.spec.ts   (NEW)
├── audit-log-subscriber-idempotency.int.spec.ts    (NEW)
├── audit-log-subscriber-resilience.int.spec.ts     (NEW)
├── audit-log-fts.int.spec.ts             (existing)
├── audit-log-export.int.spec.ts          (existing)
├── audit-log-forensic-split-migration.int.spec.ts (existing)
└── …
```

Specs live alongside the source under `application/` (not under `apps/api/test/int/`) because the jest-integration config has `rootDir: 'src'` and `testRegex: '.*\\.int\\.spec\\.ts$'`. The originally-suggested `apps/api/test/int/` path would not be discovered without a rootDir change, which is out of scope.

## Cleanup contract

- `beforeAll`: build harness, run migrations, prime cache.
- `beforeEach`: `TRUNCATE TABLE audit_log RESTART IDENTITY CASCADE` + clear LRU cache (harness exposes a `cache.entries.clear()` test-only escape hatch via a wrapper method).
- `afterAll`: close DataSource, close TestingModule.

The cache clear is critical because Jest runs all specs in a single Node process when `--runInBand` is set; LRU state would leak across `describe` blocks otherwise.

## What this slice does NOT cover

- **Hash chain integrity under emit**: sibling slice H2b covers `(prev_hash, row_hash)` chain validation after fan-out. The harness here disables hash chain validation (`AUDIT_LOG_HASH_CHAIN_ENABLED=false`) so the test doesn't depend on chain state across cases. H2b will re-enable + verify chain progression.
- **Read endpoint coverage**: `/audit-log` HTTP endpoint has its own controller + service unit specs. INT for the read path lives in `audit-log-fts.int.spec.ts` + `audit-log-export.int.spec.ts`.
- **Producer slices' emit-side correctness**: each producing slice owns its own emit-side test (e.g. `m3-recall-86-flag-dispatch`'s spec asserts the slice's service emits the right envelope). This slice trusts those tests and exercises the subscriber half.
