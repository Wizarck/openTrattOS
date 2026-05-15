import { randomUUID } from 'node:crypto';
import {
  AuditLogIntHarness,
  createAuditLogIntHarness,
} from './__helpers__/audit-log-int-harness';
import { IdempotencyConflictError } from './errors';
import { AuditEventEnvelope } from './types';

/**
 * INT spec — m3.x-audit-log-idempotency-required-mode. Verifies the
 * sliding-24h reject-on-duplicate contract against a real Postgres:
 *
 *  - envelope WITHOUT `idempotencyKey` → standard insert path (no SELECT
 *    on `audit_log.idempotency_key`).
 *  - envelope WITH a unique `idempotencyKey` → row persists, column
 *    populated.
 *  - second envelope WITH the same `(organizationId, idempotencyKey)`
 *    within the window → `IdempotencyConflictError` thrown; second row
 *    NOT persisted.
 *  - the rejected emit identifies the previously-persisted row via
 *    `error.existingId`.
 *
 * Real-PG only; runs against the shared INT harness wired by the four
 * sibling `audit-log-subscriber-*.int.spec.ts` files. No skip — the
 * harness owns DSN resolution and CI brings up Postgres on port 5433.
 */

const TEST_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('AuditLogService idempotency-required-mode (integration)', () => {
  let harness: AuditLogIntHarness;
  let orgId: string;

  beforeAll(async () => {
    harness = await createAuditLogIntHarness();
  });

  afterAll(async () => {
    await harness?.dataSource?.destroy();
    await harness?.app?.close();
  });

  beforeEach(async () => {
    await harness.truncate();
    orgId = await harness.seedOrg();
  });

  describe('opt-out path (envelope.idempotencyKey absent)', () => {
    it('persists row; idempotency_key column NULL', async () => {
      const aggregateId = randomUUID();
      const env: AuditEventEnvelope = {
        organizationId: orgId,
        aggregateType: 'recipe',
        aggregateId,
        actorUserId: TEST_USER_ID,
        actorKind: 'user',
        payloadAfter: { test: 'opt-out' },
      };
      await harness.service.record('TEST_OPT_OUT', env);
      const rows = await harness.fetchRows(orgId);
      expect(rows).toHaveLength(1);
      expect(rows[0].idempotencyKey).toBeNull();
    });
  });

  describe('opt-in path (envelope.idempotencyKey set)', () => {
    it('first emit persists; second emit with same key rejects with IdempotencyConflictError', async () => {
      const aggregateId = randomUUID();
      const idempotencyKey = `idem-${randomUUID()}`;
      const env: AuditEventEnvelope = {
        organizationId: orgId,
        aggregateType: 'recipe',
        aggregateId,
        actorUserId: TEST_USER_ID,
        actorKind: 'user',
        payloadAfter: { test: 'opt-in' },
        idempotencyKey,
      };

      const first = await harness.service.record('TEST_OPT_IN', env);
      expect(first.idempotencyKey).toBe(idempotencyKey);

      let caught: unknown = null;
      try {
        await harness.service.record('TEST_OPT_IN', env);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(IdempotencyConflictError);
      const conflictErr = caught as IdempotencyConflictError;
      expect(conflictErr.idempotencyKey).toBe(idempotencyKey);
      expect(conflictErr.organizationId).toBe(orgId);
      expect(conflictErr.existingId).toBe(first.id);

      // Exactly one row persisted — the SELECT-reject path short-circuits
      // before the INSERT, so the table reflects only the first emit.
      const rows = await harness.fetchRows(orgId);
      const matching = rows.filter((r) => r.idempotencyKey === idempotencyKey);
      expect(matching).toHaveLength(1);
      expect(matching[0].id).toBe(first.id);
    });

    it('different organizations with the same key both insert (multi-tenant scope)', async () => {
      const otherOrgId = await harness.seedOrg(
        randomUUID(),
        'idempotency-other-tenant',
      );
      const idempotencyKey = `idem-${randomUUID()}`;
      const baseEnv = {
        aggregateType: 'recipe',
        aggregateId: randomUUID(),
        actorUserId: TEST_USER_ID,
        actorKind: 'user' as const,
        payloadAfter: { test: 'multi-tenant' },
        idempotencyKey,
      };

      const a = await harness.service.record('TEST_MT', {
        ...baseEnv,
        organizationId: orgId,
      });
      const b = await harness.service.record('TEST_MT', {
        ...baseEnv,
        organizationId: otherOrgId,
      });
      expect(a.idempotencyKey).toBe(idempotencyKey);
      expect(b.idempotencyKey).toBe(idempotencyKey);
      expect(a.id).not.toBe(b.id);

      // Each tenant sees exactly one row with that key — SELECT predicate
      // is `organization_id = $1 AND idempotency_key = $2` so cross-org
      // collisions are isolated by design.
      const tenantA = await harness.fetchRows(orgId);
      const tenantB = await harness.fetchRows(otherOrgId);
      expect(tenantA.filter((r) => r.idempotencyKey === idempotencyKey)).toHaveLength(1);
      expect(tenantB.filter((r) => r.idempotencyKey === idempotencyKey)).toHaveLength(1);
    });
  });
});
