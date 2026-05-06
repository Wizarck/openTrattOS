import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import {
  AgentIdempotencyService,
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENCY_KEY_MAX_LENGTH,
  computeRequestHash,
} from '../application/agent-idempotency.service';
import { AuthenticatedUserPayload } from '../guards/roles.guard';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * M2 Wave 1.13 — m2-mcp-write-capabilities: Idempotency-Key middleware.
 *
 * Activates when:
 *   1. Request method is POST/PUT/PATCH/DELETE.
 *   2. `Idempotency-Key` header is present.
 *   3. `req.user.organizationId` is populated (auth + org-guard already ran).
 *
 * Behaviour:
 *   - Computes `request_hash = sha256(method + path + canonicalBody)`.
 *   - Lookup → replay (200, cached body) or mismatch (409) or pass-through.
 *   - On pass-through: hooks `res.json` to capture the response and record
 *     it on success (status 2xx). Failures (4xx/5xx) are NOT cached so
 *     legitimate retries can fix the underlying issue.
 *
 * IMPORTANT: this middleware runs BEFORE NestJS controllers, so it must use
 * the Express response API (`res.json`/`res.send`/`res.status`) directly
 * for replays. NestJS exception filters won't fire because we never reach
 * the controller on a replay.
 */
@Injectable()
export class IdempotencyMiddleware implements NestMiddleware {
  private readonly logger = new Logger(IdempotencyMiddleware.name);

  constructor(private readonly idempotency: AgentIdempotencyService) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (!WRITE_METHODS.has(req.method)) {
      return next();
    }
    const rawKey = readKey(req);
    if (!rawKey) {
      return next();
    }
    if (rawKey.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
      res.status(400).json({
        code: 'IDEMPOTENCY_KEY_TOO_LONG',
        message: `Idempotency-Key length exceeds ${IDEMPOTENCY_KEY_MAX_LENGTH}`,
      });
      return;
    }

    const user = (req as Request & { user?: AuthenticatedUserPayload }).user;
    const organizationId = user?.organizationId;
    if (!organizationId) {
      // No org-scope yet (pre-auth or system call). Pass through; the request
      // will likely 401 downstream. Idempotency requires an org boundary.
      return next();
    }

    const requestHash = computeRequestHash(
      req.method,
      req.originalUrl ?? req.url,
      req.body,
    );

    const result = await this.idempotency.lookup(organizationId, rawKey, requestHash);
    if (result.kind === 'mismatch') {
      res.status(409).json({
        code: 'IDEMPOTENCY_KEY_REQUEST_MISMATCH',
        message:
          'Idempotency-Key already used with a different body. Use a fresh key for new operations.',
      });
      return;
    }
    if (result.kind === 'replay') {
      res.status(result.hit.status).json(result.hit.body);
      return;
    }

    // Miss — capture response on the way out and record the cache.
    const originalJson = res.json.bind(res);
    res.json = (body?: unknown) => {
      const status = res.statusCode;
      // Cache only successful responses. 4xx/5xx are NOT cached.
      if (status >= 200 && status < 300) {
        // Fire-and-forget; failure to cache must not break the response.
        void this.idempotency
          .record(organizationId, rawKey, requestHash, status, body)
          .catch((err) =>
            this.logger.warn(
              `idempotency.record_async_failed: orgId=${organizationId} key=${rawKey} err=${(err as Error).message}`,
            ),
          );
      }
      return originalJson(body);
    };

    next();
  }
}

function readKey(req: Request): string | null {
  const raw = req.headers[IDEMPOTENCY_KEY_HEADER];
  if (raw === undefined) return null;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || value.trim() === '') return null;
  return value.trim();
}
