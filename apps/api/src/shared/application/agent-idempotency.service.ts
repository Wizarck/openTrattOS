import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryFailedError } from 'typeorm';
import { AgentIdempotencyKey } from '../domain/agent-idempotency-key.entity';

export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
export const IDEMPOTENCY_KEY_MAX_LENGTH = 200;

export interface IdempotencyHit {
  status: number;
  body: unknown;
}

export type IdempotencyLookupResult =
  | { kind: 'miss' }
  | { kind: 'replay'; hit: IdempotencyHit }
  | { kind: 'mismatch' };

/**
 * M2 Wave 1.13 — m2-mcp-write-capabilities: idempotency-key persistence.
 *
 * Behaviour per ADR-MCP-W-IDEMPOTENCY:
 * - `lookup(orgId, key, requestHash)` returns one of:
 *   - `{kind:'miss'}` — no row; caller should proceed and `record()` after.
 *   - `{kind:'replay', hit}` — same (orgId, key, requestHash) seen before;
 *     replay the cached status + body.
 *   - `{kind:'mismatch'}` — same (orgId, key) but different body; caller
 *     SHOULD respond with HTTP 409 IDEMPOTENCY_KEY_REQUEST_MISMATCH.
 * - `record(...)` is INSERT … ON CONFLICT DO NOTHING. If two parallel
 *   requests with the same key both reach `lookup → miss`, the first
 *   `record` wins and the second silently no-ops (mirrors Stripe's
 *   approach). Callers SHOULD only `record` on success (2xx); 4xx/5xx are
 *   not cached so legitimate retries can fix the underlying issue.
 *
 * `computeRequestHash` is exported so the middleware (and tests) can compute
 * the same digest deterministically.
 */
@Injectable()
export class AgentIdempotencyService {
  private readonly logger = new Logger(AgentIdempotencyService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async lookup(
    organizationId: string,
    key: string,
    requestHash: string,
  ): Promise<IdempotencyLookupResult> {
    const repo = this.dataSource.getRepository(AgentIdempotencyKey);
    const row = await repo.findOne({ where: { organizationId, key } });
    if (!row) return { kind: 'miss' };
    if (row.requestHash !== requestHash) return { kind: 'mismatch' };
    return {
      kind: 'replay',
      hit: { status: row.responseStatus, body: row.responseBody },
    };
  }

  async record(
    organizationId: string,
    key: string,
    requestHash: string,
    responseStatus: number,
    responseBody: unknown,
  ): Promise<void> {
    try {
      // ON CONFLICT DO NOTHING handles concurrent inserts safely; the loser
      // becomes a no-op. The next request that matches the key replays.
      await this.dataSource.query(
        `INSERT INTO "agent_idempotency_keys"
           ("organization_id", "key", "request_hash", "response_status", "response_body")
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT ("organization_id", "key") DO NOTHING`,
        [organizationId, key, requestHash, responseStatus, responseBody],
      );
    } catch (err) {
      // QueryFailedError on body that fails jsonb cast — log + swallow so the
      // primary response path is unaffected. Idempotency is opt-in; failure
      // to cache should not break the request.
      if (err instanceof QueryFailedError) {
        this.logger.warn(
          `idempotency.record_failed: orgId=${organizationId} key=${key} err=${err.message}`,
        );
        return;
      }
      throw err;
    }
  }
}

/**
 * sha256 of (uppercase method) + (path) + (canonicalised JSON body). Object
 * keys are sorted recursively so `{a:1, b:2}` and `{b:2, a:1}` produce the
 * same hash. Arrays preserve order.
 */
export function computeRequestHash(
  method: string,
  path: string,
  body: unknown,
): string {
  const canonical = canonicalise(body);
  const payload = `${method.toUpperCase()} ${path} ${JSON.stringify(canonical)}`;
  return createHash('sha256').update(payload).digest('hex');
}

function canonicalise(value: unknown): unknown {
  if (value === null) return null;
  if (Array.isArray(value)) return value.map(canonicalise);
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return Object.keys(obj)
      .sort()
      .reduce<Record<string, unknown>>((out, k) => {
        out[k] = canonicalise(obj[k]);
        return out;
      }, {});
  }
  return value;
}
