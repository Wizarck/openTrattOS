import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { AgentChatService } from '../application/agent-chat.service';

/**
 * Wave 1.13 [3b] — feature-flag guard for the agent-chat surface.
 *
 * Throwing `NotFoundException` from inside an `@Sse()` handler comes too
 * late: NestJS has already opened the SSE stream and replies with HTTP 200
 * before the exception filter runs. Guards run *before* route activation,
 * so this is the right place to enforce the flag and return a clean 404
 * to clients when the chat surface is off.
 */
@Injectable()
export class AgentChatEnabledGuard implements CanActivate {
  constructor(private readonly service: AgentChatService) {}

  canActivate(_ctx: ExecutionContext): boolean {
    if (!this.service.isEnabled()) {
      throw new NotFoundException();
    }
    return true;
  }
}
