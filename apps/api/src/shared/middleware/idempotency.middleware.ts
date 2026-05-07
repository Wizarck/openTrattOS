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
 * Cache shape for SSE responses. Persisted to `agent_idempotency_keys.response_body`
 * as jsonb. On replay, the middleware emits a synthetic SSE stream built
 * from this envelope (one `event: token` with the full text, zero or more
 * `event: image` frames, one `event: done`).
 */
export interface SseReplayEnvelope {
  kind: 'sse-replay';
  text: string;
  finishReason: string;
  images?: { url: string; caption?: string }[];
}

function isSseReplayEnvelope(value: unknown): value is SseReplayEnvelope {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as { kind?: unknown }).kind === 'sse-replay'
  );
}

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
      // Wave 1.13 [3c]: SSE-replay envelopes emit a synthetic stream rather
      // than echoing the cached JSON body verbatim. The chef perceives the
      // replay as instant rather than streaming — acceptable trade-off
      // (per ADR-SSE-REPLAY-1) since timing-faithful replay would 10x the
      // cache size for zero UX benefit on a retry.
      if (isSseReplayEnvelope(result.hit.body)) {
        emitSseReplay(res, result.hit.body);
        return;
      }
      res.status(result.hit.status).json(result.hit.body);
      return;
    }

    // Miss — capture response on the way out and record the cache.
    // CRITICAL: persist BEFORE the response leaves the wire. Fire-and-forget
    // here was racy: a follow-up request with the same key could land before
    // the INSERT settled, observe a miss, and execute the side effect twice.
    // Awaiting `record()` adds ~5ms of latency but is the only correctness
    // guarantee — failures still don't propagate (logged, response continues).
    const idempotency = this.idempotency;
    const logger = this.logger;
    const originalJson = res.json.bind(res);
    res.json = function patchedJson(body?: unknown) {
      const status = res.statusCode;
      if (status < 200 || status >= 300) {
        return originalJson(body);
      }
      // Block on the INSERT, then forward to the real `res.json`. Returning the
      // Promise is acceptable because Express does not consume the return
      // value of `res.json` for protocol purposes — the response is written
      // when `originalJson` is invoked.
      return idempotency
        .record(organizationId, rawKey, requestHash, status, body)
        .catch((err: unknown) => {
          logger.warn(
            `idempotency.record_failed: orgId=${organizationId} key=${rawKey} err=${(err as Error).message}`,
          );
        })
        .then(() => originalJson(body)) as unknown as Response;
    };

    // Wave 1.13 [3c]: parallel hook for `text/event-stream` responses.
    // NestJS' @Sse() decorator never goes through res.json — it writes
    // raw frames via res.write. We detect SSE via the Content-Type header
    // (set by @Sse before the first write) and capture chunks for parsing
    // at end-of-stream.
    let isSse = false;
    let captureStatus = 200;
    const capturedChunks: string[] = [];
    // Defensive bind — some Express mocks in unit tests don't expose
    // write/end. The SSE capture is opt-in via Content-Type sniffing, so a
    // missing write/end is fine (the JSON path above still works).
    const originalWrite =
      typeof res.write === 'function' ? res.write.bind(res) : null;
    const originalEnd =
      typeof res.end === 'function' ? res.end.bind(res) : null;
    if (!originalWrite || !originalEnd) {
      next();
      return;
    }

    // Express + Nest call res.writeHead implicitly; we still want to detect
    // the Content-Type that @Sse() sets via res.setHeader. Sniff at first
    // write.
    res.write = function patchedWrite(chunk: unknown, ...rest: unknown[]) {
      if (!isSse) {
        const ct = String(res.getHeader('content-type') ?? '').toLowerCase();
        if (ct.includes('text/event-stream')) {
          isSse = true;
          captureStatus = res.statusCode;
        }
      }
      if (isSse && chunk !== undefined && chunk !== null) {
        const text =
          typeof chunk === 'string'
            ? chunk
            : Buffer.isBuffer(chunk)
            ? chunk.toString('utf8')
            : '';
        if (text) capturedChunks.push(text);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (originalWrite as any)(chunk, ...rest);
    } as Response['write'];

    res.end = function patchedEnd(...args: unknown[]) {
      if (
        isSse &&
        captureStatus >= 200 &&
        captureStatus < 300 &&
        capturedChunks.length > 0
      ) {
        const envelope = parseSseFramesToReplayEnvelope(capturedChunks.join(''));
        if (envelope) {
          // Same persist-then-send guarantee as the JSON path.
          return idempotency
            .record(organizationId, rawKey, requestHash, captureStatus, envelope)
            .catch((err: unknown) => {
              logger.warn(
                `idempotency.sse_record_failed: orgId=${organizationId} key=${rawKey} err=${(err as Error).message}`,
              );
            })
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .then(() => (originalEnd as any)(...args)) as unknown as Response;
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (originalEnd as any)(...args);
    } as Response['end'];

    next();
  }
}

/**
 * Build a synthetic SSE response from a cached envelope. One `event: token`
 * frame with the full text, then one `event: image` per image, then one
 * `event: done`. Marks `replayed: true` in the done payload so consumers
 * can distinguish a replay from a live first turn.
 */
function emitSseReplay(res: Response, envelope: SseReplayEnvelope): void {
  res.status(200);
  res.setHeader('content-type', 'text/event-stream');
  res.setHeader('cache-control', 'no-cache');
  res.setHeader('connection', 'keep-alive');
  res.write(`event: token\ndata: ${JSON.stringify({ chunk: envelope.text })}\n\n`);
  for (const img of envelope.images ?? []) {
    res.write(`event: image\ndata: ${JSON.stringify(img)}\n\n`);
  }
  res.write(
    `event: done\ndata: ${JSON.stringify({
      finishReason: envelope.finishReason,
      replayed: true,
    })}\n\n`,
  );
  res.end();
}

/**
 * Parse the captured SSE wire bytes into a replay envelope. Concatenates
 * `event: token` chunks into the `text` field, captures `event: image`
 * frames into the `images` array, picks `finishReason` from the last
 * `event: done`. Tool-calling intermediates are intentionally dropped
 * (per ADR-SSE-REPLAY-1).
 */
export function parseSseFramesToReplayEnvelope(raw: string): SseReplayEnvelope | null {
  let text = '';
  let finishReason: string | null = null;
  const images: { url: string; caption?: string }[] = [];

  // Split by frame boundary (\n\n). Each frame may have multiple lines;
  // we care about `event:` and `data:` lines.
  for (const frame of raw.split(/\n\n/)) {
    if (!frame.trim()) continue;
    let event: string | null = null;
    let dataJson = '';
    for (const line of frame.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataJson += line.slice(5).trim();
    }
    if (!event || !dataJson) continue;
    let data: unknown;
    try {
      data = JSON.parse(dataJson);
    } catch {
      continue;
    }
    if (event === 'token' && typeof (data as { chunk?: unknown }).chunk === 'string') {
      text += (data as { chunk: string }).chunk;
    } else if (event === 'image' && typeof (data as { url?: unknown }).url === 'string') {
      const obj = data as { url: string; caption?: string };
      images.push(obj.caption ? { url: obj.url, caption: obj.caption } : { url: obj.url });
    } else if (event === 'done') {
      finishReason = String((data as { finishReason?: unknown }).finishReason ?? 'stop');
    }
    // tool-calling, error, proactive intentionally ignored
  }

  if (!finishReason) return null; // Stream did not complete cleanly — don't cache
  const out: SseReplayEnvelope = { kind: 'sse-replay', text, finishReason };
  if (images.length > 0) out.images = images;
  return out;
}

function readKey(req: Request): string | null {
  const raw = req.headers[IDEMPOTENCY_KEY_HEADER];
  if (raw === undefined) return null;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || value.trim() === '') return null;
  return value.trim();
}
