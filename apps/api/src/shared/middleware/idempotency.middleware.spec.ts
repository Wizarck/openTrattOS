import type { NextFunction, Request, Response } from 'express';
import {
  AgentIdempotencyService,
  IdempotencyLookupResult,
} from '../application/agent-idempotency.service';
import { IdempotencyMiddleware } from './idempotency.middleware';

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    method: 'POST',
    headers: {},
    originalUrl: '/recipes',
    body: {},
    ...overrides,
  } as Request;
}

function makeRes(): Response & {
  _status?: number;
  _json?: unknown;
} {
  const res: Record<string, unknown> = {
    statusCode: 200,
    setHeader: jest.fn(),
    status(code: number) {
      this.statusCode = code;
      this._status = code;
      return this;
    },
    json(body: unknown) {
      this._json = body;
      return this;
    },
    send(body: unknown) {
      this._json = body;
      return this;
    },
  };
  return res as unknown as Response & { _status?: number; _json?: unknown };
}

const ORG = '11111111-1111-4111-8111-111111111111';

describe('IdempotencyMiddleware', () => {
  let svc: jest.Mocked<Pick<AgentIdempotencyService, 'lookup' | 'record'>>;
  let mw: IdempotencyMiddleware;

  beforeEach(() => {
    svc = {
      lookup: jest.fn<Promise<IdempotencyLookupResult>, [string, string, string]>(),
      record: jest.fn(),
    } as never;
    mw = new IdempotencyMiddleware(svc as unknown as AgentIdempotencyService);
  });

  it('passes through GET requests (read methods)', async () => {
    const req = makeReq({ method: 'GET', headers: { 'idempotency-key': 'abc' } });
    const res = makeRes();
    const next = jest.fn();
    await mw.use(req, res, next as NextFunction);
    expect(next).toHaveBeenCalled();
    expect(svc.lookup).not.toHaveBeenCalled();
  });

  it('passes through write without Idempotency-Key header', async () => {
    const req = makeReq();
    const res = makeRes();
    const next = jest.fn();
    await mw.use(req, res, next as NextFunction);
    expect(next).toHaveBeenCalled();
    expect(svc.lookup).not.toHaveBeenCalled();
  });

  it('rejects header longer than 200 chars with 400', async () => {
    const req = makeReq({
      headers: { 'idempotency-key': 'a'.repeat(201) },
      user: { organizationId: ORG, userId: 'u', role: 'OWNER' as const },
    } as Partial<Request>);
    const res = makeRes();
    const next = jest.fn();
    await mw.use(req, res, next as NextFunction);
    expect(res._status).toBe(400);
    expect((res._json as { code: string }).code).toBe('IDEMPOTENCY_KEY_TOO_LONG');
    expect(next).not.toHaveBeenCalled();
  });

  it('passes through when no organizationId on req.user (pre-auth)', async () => {
    const req = makeReq({
      headers: { 'idempotency-key': 'abc' },
    });
    const res = makeRes();
    const next = jest.fn();
    await mw.use(req, res, next as NextFunction);
    expect(next).toHaveBeenCalled();
    expect(svc.lookup).not.toHaveBeenCalled();
  });

  it('lookup miss → calls next and hooks res.json to record on 2xx', async () => {
    svc.lookup.mockResolvedValue({ kind: 'miss' });
    svc.record.mockResolvedValue();
    const req = makeReq({
      headers: { 'idempotency-key': 'abc' },
      user: { organizationId: ORG, userId: 'u', role: 'OWNER' as const },
    } as Partial<Request>);
    const res = makeRes();
    const next = jest.fn();
    await mw.use(req, res, next as NextFunction);
    expect(next).toHaveBeenCalled();

    // Simulate the controller writing the response.
    res.statusCode = 201;
    res.json({ id: 'r1' });

    // Wait microtask flush so the async record fires.
    await new Promise((r) => setImmediate(r));
    expect(svc.record).toHaveBeenCalledWith(
      ORG,
      'abc',
      expect.any(String),
      201,
      { id: 'r1' },
    );
  });

  it('lookup miss → does NOT cache on 4xx response', async () => {
    svc.lookup.mockResolvedValue({ kind: 'miss' });
    svc.record.mockResolvedValue();
    const req = makeReq({
      headers: { 'idempotency-key': 'abc' },
      user: { organizationId: ORG, userId: 'u', role: 'OWNER' as const },
    } as Partial<Request>);
    const res = makeRes();
    const next = jest.fn();
    await mw.use(req, res, next as NextFunction);
    res.statusCode = 422;
    res.json({ code: 'BAD' });
    await new Promise((r) => setImmediate(r));
    expect(svc.record).not.toHaveBeenCalled();
  });

  it('lookup replay → returns cached response with original status', async () => {
    svc.lookup.mockResolvedValue({
      kind: 'replay',
      hit: { status: 201, body: { id: 'r1', cached: true } },
    });
    const req = makeReq({
      headers: { 'idempotency-key': 'abc' },
      user: { organizationId: ORG, userId: 'u', role: 'OWNER' as const },
    } as Partial<Request>);
    const res = makeRes();
    const next = jest.fn();
    await mw.use(req, res, next as NextFunction);
    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(201);
    expect(res._json).toEqual({ id: 'r1', cached: true });
  });

  it('lookup mismatch → 409 IDEMPOTENCY_KEY_REQUEST_MISMATCH', async () => {
    svc.lookup.mockResolvedValue({ kind: 'mismatch' });
    const req = makeReq({
      headers: { 'idempotency-key': 'abc' },
      user: { organizationId: ORG, userId: 'u', role: 'OWNER' as const },
    } as Partial<Request>);
    const res = makeRes();
    const next = jest.fn();
    await mw.use(req, res, next as NextFunction);
    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(409);
    expect((res._json as { code: string }).code).toBe(
      'IDEMPOTENCY_KEY_REQUEST_MISMATCH',
    );
  });
});
