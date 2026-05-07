import { NotFoundException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { AgentChatService } from '../application/agent-chat.service';
import { AgentChatEnabledGuard } from './agent-chat-enabled.guard';

function makeCtx(): ExecutionContext {
  return {} as ExecutionContext;
}

describe('AgentChatEnabledGuard', () => {
  it('allows the request when isEnabled() returns true', () => {
    const svc = { isEnabled: jest.fn().mockReturnValue(true) } as unknown as AgentChatService;
    const guard = new AgentChatEnabledGuard(svc);
    expect(guard.canActivate(makeCtx())).toBe(true);
  });

  it('throws NotFoundException when isEnabled() returns false', () => {
    const svc = { isEnabled: jest.fn().mockReturnValue(false) } as unknown as AgentChatService;
    const guard = new AgentChatEnabledGuard(svc);
    expect(() => guard.canActivate(makeCtx())).toThrow(NotFoundException);
  });
});
