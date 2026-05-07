import {
  Body,
  Controller,
  NotFoundException,
  Post,
  Req,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Observable, map } from 'rxjs';
import { AgentChatService } from '../application/agent-chat.service';
import { Roles } from '../../shared/decorators/roles.decorator';
import { AuditAggregate } from '../../shared/decorators/audit-aggregate.decorator';
import { AuthenticatedUserPayload } from '../../shared/guards/roles.guard';
import { ChatRequestDto, ChatSseEvent } from './dto/agent-chat.dto';
import { AgentChatEnabledGuard } from './agent-chat-enabled.guard';

/**
 * Wave 1.13 [3b] — first-party web-chat surface.
 *
 * `OPENTRATTOS_AGENT_ENABLED=false` → 404 (defence in depth: the service
 * also throws 404 internally). Authenticated users of any role can chat;
 * tool-call authorisation is handled per-capability by the existing
 * AgentCapabilityGuard (Wave 1.13 [3a]) once Hermes invokes a write.
 *
 * The controller injects `req.agentContext` server-side so the
 * BeforeAfterAuditInterceptor (Wave 1.13 [3a]) attributes audit rows to
 * `agentName='hermes-web'` + `capability='chat.message'` without trusting
 * client-supplied `X-Agent-*` headers (which we deliberately ignore here).
 */
@ApiTags('agent-chat')
@Controller('agent-chat')
export class AgentChatController {
  constructor(private readonly service: AgentChatService) {}

  @Post('stream')
  @UseGuards(AgentChatEnabledGuard)
  @Sse()
  @Roles('OWNER', 'MANAGER', 'STAFF')
  @AuditAggregate('chat_session', (req) => {
    const body = req.body as { sessionId?: string } | undefined;
    return body?.sessionId ?? null;
  })
  @ApiOperation({
    summary: 'Open an SSE chat stream with the openTrattOS agent (feature-flagged)',
  })
  stream(
    @Body() body: ChatRequestDto,
    @Req() req: Request,
  ): Observable<{ data: unknown; type: string }> {
    const user = (req as Request & { user?: AuthenticatedUserPayload }).user;
    if (!user) {
      // Should be impossible — auth runs before us — but kept as a safety
      // net so a misconfigured pipeline can't leak chat to anonymous callers.
      throw new NotFoundException();
    }

    // Inject the agent context server-side. The BeforeAfterAuditInterceptor
    // reads this AFTER the controller returns; setting it here ensures
    // the audit row carries `agentName='hermes-web'` + the chat capability.
    req.agentContext = {
      viaAgent: true,
      agentName: 'hermes-web',
      capabilityName: 'chat.message',
    };

    // Map ChatSseEvent → NestJS MessageEvent shape so @Sse() emits proper
    // SSE frames with `event: <type>` lines (instead of folding the event
    // type into the data payload). This keeps the wire format aligned with
    // what Hermes itself emits, and lets browser EventSource consumers
    // dispatch by event name without parsing the JSON.
    return this.service
      .stream(body, {
        userId: user.userId,
        organizationId: user.organizationId,
      })
      .pipe(map((event: ChatSseEvent) => ({ data: event.data, type: event.event })));
  }
}
