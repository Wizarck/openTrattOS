import { NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of, toArray } from 'rxjs';
import type { Request } from 'express';
import {
  AUDIT_AGGREGATE_KEY,
  AuditAggregateMeta,
} from '../../shared/decorators/audit-aggregate.decorator';
import { AgentChatService } from '../application/agent-chat.service';
import { AgentChatController } from './agent-chat.controller';

function fakeReq(user?: unknown): Request {
  return { user, body: {} } as unknown as Request;
}

describe('AgentChatController', () => {
  let service: { isEnabled: jest.Mock; stream: jest.Mock };
  let controller: AgentChatController;

  beforeEach(() => {
    service = {
      isEnabled: jest.fn().mockReturnValue(true),
      stream: jest.fn(),
    };
    controller = new AgentChatController(service as unknown as AgentChatService);
  });

  it('returns 404 when req.user is missing (defence in depth)', () => {
    expect(() =>
      controller.stream(
        { message: { type: 'text', content: 'x' } },
        fakeReq(undefined),
      ),
    ).toThrow(NotFoundException);
  });

  it('injects req.agentContext server-side before invoking the service', async () => {
    const events = of({ event: 'done' as const, data: { finishReason: 'stop' } });
    service.stream.mockReturnValue(events);
    const req = fakeReq({ userId: 'u1', organizationId: 'o1' });

    const result$ = controller.stream(
      { message: { type: 'text', content: 'hola' } },
      req,
    );
    await lastValueFrom(result$.pipe(toArray()));

    // The controller must have stamped agentContext for the audit interceptor.
    expect(req.agentContext).toEqual({
      viaAgent: true,
      agentName: 'hermes-web',
      capabilityName: 'chat.message',
    });
  });

  it('forwards user identity to the service', async () => {
    service.stream.mockReturnValue(of({ event: 'done' as const, data: { finishReason: 'stop' } }));
    const req = fakeReq({ userId: 'user-X', organizationId: 'org-Y' });
    await lastValueFrom(
      controller
        .stream({ message: { type: 'text', content: 'x' } }, req)
        .pipe(toArray()),
    );
    expect(service.stream).toHaveBeenCalledWith(
      { message: { type: 'text', content: 'x' } },
      { userId: 'user-X', organizationId: 'org-Y' },
    );
  });

  it('maps each ChatSseEvent to a NestJS MessageEvent with `type` so @Sse() emits proper SSE frames', async () => {
    service.stream.mockReturnValue(
      of(
        { event: 'token' as const, data: { chunk: 'Hi' } },
        { event: 'done' as const, data: { finishReason: 'stop' } },
      ),
    );
    const req = fakeReq({ userId: 'u', organizationId: 'o' });
    const out = await lastValueFrom(
      controller
        .stream({ message: { type: 'text', content: 'x' } }, req)
        .pipe(toArray()),
    );
    // `type` becomes the `event:` SSE line; `data` becomes the JSON payload.
    expect(out).toEqual([
      { data: { chunk: 'Hi' }, type: 'token' },
      { data: { finishReason: 'stop' }, type: 'done' },
    ]);
  });
});

describe('AgentChatController — metadata', () => {
  it('handler carries @AuditAggregate metadata for the BeforeAfterAuditInterceptor', () => {
    const reflector = new Reflector();
    const meta = reflector.get<AuditAggregateMeta>(
      AUDIT_AGGREGATE_KEY,
      AgentChatController.prototype.stream,
    );
    expect(meta).toBeDefined();
    expect(meta.aggregateType).toBe('chat_session');
    expect(meta.idExtractor).toBeInstanceOf(Function);
    if (meta.idExtractor) {
      // idExtractor pulls req.body.sessionId
      const id = meta.idExtractor({
        body: { sessionId: 'sess-Z' },
      } as unknown as Request);
      expect(id).toBe('sess-Z');
      const idMissing = meta.idExtractor({ body: {} } as unknown as Request);
      expect(idMissing).toBeNull();
    }
  });
});
