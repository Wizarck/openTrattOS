import { NotFoundException } from '@nestjs/common';
import { lastValueFrom, of, toArray } from 'rxjs';
import type { Request } from 'express';
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

