import type { NextFunction, Request, Response } from 'express';
import { AgentIdempotencyService } from '../application/agent-idempotency.service';
import {
  IdempotencyMiddleware,
  parseSseFramesToReplayEnvelope,
  SseReplayEnvelope,
} from './idempotency.middleware';

const ORG = '11111111-1111-4111-8111-111111111111';
const REQUEST_HASH_RE = /^[0-9a-f]+$/i;

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    method: 'POST',
    headers: { 'idempotency-key': 'k-1' },
    originalUrl: '/agent-chat/stream',
    body: { message: { type: 'text', content: 'hi' } },
    ...overrides,
  } as Request;
}

interface CapturingRes {
  res: Response;
  written: string[];
  ended: boolean;
  statusCode: number;
  contentType: string;
  endResolved: Promise<void>;
}

function makeStreamingRes(): CapturingRes {
  const written: string[] = [];
  let ended = false;
  let resolveEnd!: () => void;
  const endResolved = new Promise<void>((resolve) => {
    resolveEnd = resolve;
  });
  const headers: Record<string, string> = {};
  const res: Record<string, unknown> = {
    statusCode: 200,
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value;
    },
    getHeader(name: string) {
      return headers[name.toLowerCase()];
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    write(chunk: unknown) {
      const text =
        typeof chunk === 'string'
          ? chunk
          : Buffer.isBuffer(chunk)
          ? chunk.toString('utf8')
          : '';
      if (text) written.push(text);
      return true;
    },
    end() {
      ended = true;
      resolveEnd();
      return this;
    },
    json: jest.fn(),
  };
  return {
    res: res as unknown as Response,
    written,
    get ended() {
      return ended;
    },
    get statusCode() {
      return res.statusCode as number;
    },
    get contentType() {
      return headers['content-type'] ?? '';
    },
    endResolved,
  };
}

function makeSvc() {
  return {
    lookup: jest.fn(),
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<AgentIdempotencyService>;
}

describe('parseSseFramesToReplayEnvelope (helper)', () => {
  it('concatenates token chunks + captures finishReason', () => {
    const raw =
      'event: token\ndata: {"chunk":"Hola "}\n\n' +
      'event: token\ndata: {"chunk":"Lourdes"}\n\n' +
      'event: done\ndata: {"finishReason":"stop"}\n\n';
    const env = parseSseFramesToReplayEnvelope(raw);
    expect(env).toEqual({ kind: 'sse-replay', text: 'Hola Lourdes', finishReason: 'stop' });
  });

  it('captures image events into the images array', () => {
    const raw =
      'event: token\ndata: {"chunk":"see this:"}\n\n' +
      'event: image\ndata: {"url":"https://x.test/a.png","caption":"diagram"}\n\n' +
      'event: image\ndata: {"url":"https://x.test/b.png"}\n\n' +
      'event: done\ndata: {"finishReason":"stop"}\n\n';
    const env = parseSseFramesToReplayEnvelope(raw)!;
    expect(env.images).toEqual([
      { url: 'https://x.test/a.png', caption: 'diagram' },
      { url: 'https://x.test/b.png' },
    ]);
  });

  it('drops tool-calling intermediates', () => {
    const raw =
      'event: token\ndata: {"chunk":"calling..."}\n\n' +
      'event: tool-calling\ndata: {"tool":"recipes.read"}\n\n' +
      'event: token\ndata: {"chunk":" done"}\n\n' +
      'event: done\ndata: {"finishReason":"stop"}\n\n';
    const env = parseSseFramesToReplayEnvelope(raw)!;
    expect(env.text).toBe('calling... done');
    expect((env as unknown as Record<string, unknown>).toolCalls).toBeUndefined();
  });

  it('returns null when stream did not complete (no done event)', () => {
    const raw = 'event: token\ndata: {"chunk":"partial"}\n\n';
    expect(parseSseFramesToReplayEnvelope(raw)).toBeNull();
  });

  it('handles Nest @Sse() id: prefixes', () => {
    // Nest emits frames like `id: 1\nevent: token\ndata: {...}\n\n`
    const raw =
      'id: 1\nevent: token\ndata: {"chunk":"x"}\n\n' +
      'id: 2\nevent: done\ndata: {"finishReason":"stop"}\n\n';
    const env = parseSseFramesToReplayEnvelope(raw)!;
    expect(env.text).toBe('x');
  });
});

describe('IdempotencyMiddleware — SSE capture path', () => {
  it('captures SSE frames and records them via agent-idempotency.record on stream end', async () => {
    const svc = makeSvc();
    svc.lookup.mockResolvedValue({ kind: 'miss' } as never);
    const middleware = new IdempotencyMiddleware(svc);
    const req = makeReq();
    (req as Request & { user?: unknown }).user = { userId: 'u', organizationId: ORG, role: 'OWNER' };
    const cap = makeStreamingRes();

    const next: NextFunction = jest.fn();
    await middleware.use(req, cap.res, next);
    expect(next).toHaveBeenCalled();

    // Simulate Nest @Sse() emitting frames: it sets content-type then writes.
    cap.res.setHeader('content-type', 'text/event-stream');
    cap.res.write('event: token\ndata: {"chunk":"Hi"}\n\n');
    cap.res.write('event: done\ndata: {"finishReason":"stop"}\n\n');
    cap.res.end();
    await cap.endResolved;
    // The async record promise lands a microtask later; flush.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(svc.record).toHaveBeenCalledTimes(1);
    const recordedBody = svc.record.mock.calls[0][4];
    expect(recordedBody).toEqual({ kind: 'sse-replay', text: 'Hi', finishReason: 'stop' });
  });

  it('JSON write path is bit-for-bit unchanged (regression guard for 3a)', async () => {
    const svc = makeSvc();
    svc.lookup.mockResolvedValue({ kind: 'miss' } as never);
    const middleware = new IdempotencyMiddleware(svc);
    const req = makeReq({ originalUrl: '/recipes' });
    (req as Request & { user?: unknown }).user = { userId: 'u', organizationId: ORG, role: 'OWNER' };
    const headers: Record<string, string> = {};
    const resObj: Record<string, unknown> & { statusCode: number } = {
      statusCode: 200,
      setHeader(name: string, value: string) {
        headers[name.toLowerCase()] = value;
      },
      getHeader(name: string) {
        return headers[name.toLowerCase()];
      },
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      write: jest.fn().mockReturnValue(true),
      end: jest.fn().mockReturnValue(this),
      json: jest.fn().mockReturnValue(this),
    };
    const res = resObj as unknown as Response;

    await middleware.use(req, res, jest.fn());
    // After middleware.use, res.json has been patched to capture the body and
    // call the original. Invoking it should trigger svc.record.
    await (res.json as unknown as (body: unknown) => Promise<Response>)({
      data: { id: 'x' },
      missingFields: [],
      nextRequired: null,
    });
    expect(svc.record).toHaveBeenCalledTimes(1);
    expect(typeof svc.record.mock.calls[0][3]).toBe('number');
    expect(svc.record.mock.calls[0][2]).toMatch(REQUEST_HASH_RE);
  });
});

describe('IdempotencyMiddleware — SSE replay path', () => {
  it('emits a synthetic SSE stream from a cached envelope', async () => {
    const svc = makeSvc();
    const cachedEnvelope: SseReplayEnvelope = {
      kind: 'sse-replay',
      text: 'Hola Lourdes',
      finishReason: 'stop',
      images: [{ url: 'https://x.test/a.png', caption: 'diagram' }],
    };
    svc.lookup.mockResolvedValue({
      kind: 'replay',
      hit: { status: 200, body: cachedEnvelope },
    } as never);
    const middleware = new IdempotencyMiddleware(svc);
    const req = makeReq();
    (req as Request & { user?: unknown }).user = { userId: 'u', organizationId: ORG, role: 'OWNER' };
    const cap = makeStreamingRes();

    const next: NextFunction = jest.fn();
    await middleware.use(req, cap.res, next);
    expect(next).not.toHaveBeenCalled();
    expect(svc.record).not.toHaveBeenCalled();

    expect(cap.contentType).toBe('text/event-stream');
    expect(cap.statusCode).toBe(200);
    const body = cap.written.join('');
    expect(body).toContain('event: token');
    expect(body).toContain('"chunk":"Hola Lourdes"');
    expect(body).toContain('event: image');
    expect(body).toContain('"caption":"diagram"');
    expect(body).toContain('event: done');
    expect(body).toContain('"replayed":true');
    expect(cap.ended).toBe(true);
  });

  it('mismatched key still returns 409 (regression guard for 3a)', async () => {
    const svc = makeSvc();
    svc.lookup.mockResolvedValue({ kind: 'mismatch' } as never);
    const middleware = new IdempotencyMiddleware(svc);
    const req = makeReq();
    (req as Request & { user?: unknown }).user = { userId: 'u', organizationId: ORG, role: 'OWNER' };
    const headers: Record<string, string> = {};
    const resObj: Record<string, unknown> & { statusCode: number } = {
      statusCode: 200,
      setHeader(name: string, value: string) {
        headers[name.toLowerCase()] = value;
      },
      getHeader(name: string) {
        return headers[name.toLowerCase()];
      },
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json: jest.fn().mockReturnThis(),
    };
    const res = resObj as unknown as Response;

    await middleware.use(req, res, jest.fn());
    expect(res.statusCode).toBe(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'IDEMPOTENCY_KEY_REQUEST_MISMATCH' }),
    );
  });
});
