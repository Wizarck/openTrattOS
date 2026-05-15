import { randomUUID } from 'node:crypto';
import {
  AuditEventEnvelope,
  AuditEventType,
  AuditEventTypeName,
} from '../../audit-log/application/types';
import {
  RevocationIntHarness,
  createRevocationIntHarness,
} from './__helpers__/revocation-int-harness';

/**
 * INT spec for `m3.x-photo-ingest-revocation-int`. Exercises the
 * end-to-end `HITL_RETROACTIVE_CORRECTION → DownstreamRevocationSubscriber →
 * real-Postgres UPDATE` path that listener slice
 * `m3.x-photo-ingest-downstream-revocation-listener` (PR #157) shipped
 * with only unit-spec coverage.
 *
 * Scope (deliberately narrow):
 *   AC-INT-1: happy path Lot — real-Postgres UPDATE flips requires_review
 *             when source_photo_ingestion_id matches the corrected item id.
 *   AC-INT-2: multi-tenant isolation — only the emitting tenant's Lot
 *             flips, the sibling tenant's Lot stays unflipped.
 *   AC-INT-3: no-match — emit for an unrelated item id leaves the seeded
 *             Lot unflipped.
 *
 * What's deliberately NOT asserted here: the downstream `LOT_FLAGGED_FOR_REVIEW`
 * / `GR_FLAGGED_FOR_REVIEW` audit envelopes. The DownstreamRevocationSubscriber
 * emits those by re-entering the bus from inside its `@OnEvent(HITL)` handler.
 * That re-entrant emit chain is covered by the unit subscriber spec
 * (`downstream-revocation.subscriber.spec.ts` mocks the EventEmitter and
 * asserts the calls); replicating it at the INT layer would re-test bus
 * wiring instead of the SQL contract this slice is meant to verify.
 *
 * What's verified at INT: real-Postgres CHECK constraints + FKs + the
 * raw SQL UPDATE...RETURNING that the repository runs. That is the
 * production-bug surface unit specs cannot reach.
 */
describe('DownstreamRevocationSubscriber end-to-end (integration)', () => {
  let harness: RevocationIntHarness;

  beforeAll(async () => {
    harness = await createRevocationIntHarness();
  });

  afterAll(async () => {
    await harness?.dataSource?.destroy();
    await harness?.app?.close();
  });

  beforeEach(async () => {
    await harness.truncate();
  });

  it('AC-INT-1 — Lot with matching source_photo_ingestion_id flips requires_review against real Postgres', async () => {
    const orgId = await harness.seedOrg();
    const locationId = await harness.seedLocation(orgId);
    const userId = await harness.seedUser(orgId);
    const photoId = await harness.seedPhoto(orgId, userId);
    const itemId = await harness.seedPhotoIngestionItem(orgId, photoId);
    const lotId = await harness.seedLot(orgId, locationId, {
      sourcePhotoIngestionId: itemId,
    });

    // Sanity — Lot starts with requires_review=false (the default).
    const before = await harness.fetchLotById(lotId);
    expect(before).not.toBeNull();
    expect(before!.requiresReview).toBe(false);

    await harness.emitAndWait(AuditEventType.HITL_RETROACTIVE_CORRECTION, {
      organizationId: orgId,
      aggregateType: 'photo_ingestion_item',
      aggregateId: itemId,
      actorUserId: null,
      actorKind: 'user',
      payloadAfter: { reason: 'operator-correction' },
    } satisfies AuditEventEnvelope);

    const after = await harness.fetchLotById(lotId);
    expect(after!.requiresReview).toBe(true);
    expect(after!.sourcePhotoIngestionId).toBe(itemId);
    expect(after!.organizationId).toBe(orgId);

    // The producer's own envelope is persisted (single-level emit; works
    // in audit-log-subscriber-fan-out.int.spec.ts). Asserting it here
    // closes the loop on the real EventEmitter + AuditLogSubscriber +
    // real-Postgres INSERT path that this BC depends on.
    const rows = await harness.fetchAuditRows(orgId);
    const hitlRows = rows.filter(
      (r) =>
        r.eventType ===
        AuditEventTypeName[AuditEventType.HITL_RETROACTIVE_CORRECTION],
    );
    expect(hitlRows).toHaveLength(1);
    expect(hitlRows[0].aggregateId).toBe(itemId);
  });

  it('AC-INT-2 — multi-tenant isolation: only the emitting tenant Lot is flipped', async () => {
    const orgA = await harness.seedOrg();
    const orgB = await harness.seedOrg();

    const locA = await harness.seedLocation(orgA);
    const locB = await harness.seedLocation(orgB);

    const userA = await harness.seedUser(orgA);
    const userB = await harness.seedUser(orgB);

    const photoA = await harness.seedPhoto(orgA, userA);
    const photoB = await harness.seedPhoto(orgB, userB);

    const itemA = await harness.seedPhotoIngestionItem(orgA, photoA);
    const itemB = await harness.seedPhotoIngestionItem(orgB, photoB);

    const lotA = await harness.seedLot(orgA, locA, {
      sourcePhotoIngestionId: itemA,
    });
    const lotB = await harness.seedLot(orgB, locB, {
      sourcePhotoIngestionId: itemB,
    });

    await harness.emitAndWait(AuditEventType.HITL_RETROACTIVE_CORRECTION, {
      organizationId: orgA,
      aggregateType: 'photo_ingestion_item',
      aggregateId: itemA,
      actorUserId: null,
      actorKind: 'user',
      payloadAfter: { reason: 'operator-correction' },
    } satisfies AuditEventEnvelope);

    const fetchedA = await harness.fetchLotById(lotA);
    const fetchedB = await harness.fetchLotById(lotB);
    expect(fetchedA!.requiresReview).toBe(true);
    expect(fetchedB!.requiresReview).toBe(false);
  });

  it('AC-INT-3 — no-match: emit for an unrelated item id leaves the seeded Lot unflipped', async () => {
    const orgId = await harness.seedOrg();
    const locationId = await harness.seedLocation(orgId);
    const userId = await harness.seedUser(orgId);
    const photoId = await harness.seedPhoto(orgId, userId);

    const seededItemId = await harness.seedPhotoIngestionItem(orgId, photoId);
    const lotId = await harness.seedLot(orgId, locationId, {
      sourcePhotoIngestionId: seededItemId,
    });

    const unrelatedItemId = randomUUID();
    await harness.emitAndWait(AuditEventType.HITL_RETROACTIVE_CORRECTION, {
      organizationId: orgId,
      aggregateType: 'photo_ingestion_item',
      aggregateId: unrelatedItemId,
      actorUserId: null,
      actorKind: 'user',
      payloadAfter: { reason: 'operator-correction' },
    } satisfies AuditEventEnvelope);

    const lot = await harness.fetchLotById(lotId);
    expect(lot!.requiresReview).toBe(false);
  });
});
