import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuditAggregate } from '../../shared/decorators/audit-aggregate.decorator';
import { Roles } from '../../shared/decorators/roles.decorator';
import { AuthenticatedUserPayload } from '../../shared/guards/roles.guard';
import {
  WriteResponseDto,
  toWriteResponse,
} from '../../shared/dto/write-response.dto';
import { AgentCredentialsService } from '../application/agent-credentials.service';
import { AgentCredential } from '../domain/agent-credential.entity';
import {
  AgentCredentialResponse,
  CreateAgentCredentialDto,
  RotateAgentCredentialDto,
} from './dto/agent-credential.dto';

/**
 * Wave 1.13 [3c] — m2-mcp-agent-registry-bench. REST surface for the
 * `agent_credentials` table. Owner-only.
 *
 * Audit emission is via the existing 3a `BeforeAfterAuditInterceptor`
 * (writes one `AGENT_ACTION_FORENSIC` row per CRUD operation per ADR-026,
 * anchored to `aggregate_type='agent_credential'`). The signature
 * middleware itself is wired separately in `SharedModule`; this
 * controller does NOT consume signed requests — humans (Owners)
 * curl/POST it.
 */
@ApiTags('Agent Credentials')
@Controller('agent-credentials')
export class AgentCredentialsController {
  constructor(private readonly service: AgentCredentialsService) {}

  @Post()
  @Roles('OWNER')
  @AuditAggregate('agent_credential', null)
  @ApiOperation({
    summary: 'Register a new agent credential',
    description:
      'Stores the Ed25519 public key for an agent under the calling user\'s organization. Public keys are not echoed back in any response — store them yourself before submitting.',
  })
  async create(
    @Body() dto: CreateAgentCredentialDto,
    @Req() req: Request,
  ): Promise<WriteResponseDto<AgentCredentialResponse>> {
    const user = requireUser(req);
    const row = await this.service.create({
      organizationId: user.organizationId,
      agentName: dto.agentName,
      publicKey: dto.publicKey,
      role: dto.role,
    });
    return toWriteResponse(toResponse(row));
  }

  @Get()
  @Roles('OWNER')
  @ApiOperation({ summary: 'List agent credentials for the calling org' })
  async list(@Req() req: Request): Promise<AgentCredentialResponse[]> {
    const user = requireUser(req);
    const rows = await this.service.list(user.organizationId);
    return rows.map(toResponse);
  }

  @Get(':id')
  @Roles('OWNER')
  @ApiOperation({ summary: 'Get a single agent credential' })
  async getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ): Promise<AgentCredentialResponse> {
    const user = requireUser(req);
    const row = await this.service.getById(id, user.organizationId);
    return toResponse(row);
  }

  @Put(':id/revoke')
  @Roles('OWNER')
  @AuditAggregate('agent_credential')
  @ApiOperation({
    summary: 'Revoke an agent credential (soft-delete)',
    description:
      'Sets `revoked_at` to now(); the row stays in the table so historical audit queries can still resolve agentName → id bindings. Re-registering the same agentName requires a hard DELETE first.',
  })
  async revoke(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ): Promise<WriteResponseDto<AgentCredentialResponse>> {
    const user = requireUser(req);
    const row = await this.service.revoke(id, user.organizationId);
    return toWriteResponse(toResponse(row));
  }

  @Post(':id/rotate')
  @Roles('OWNER')
  @AuditAggregate('agent_credential')
  @ApiOperation({
    summary: 'Rotate an agent credential\'s public key (atomic swap)',
    description:
      'Replaces the row\'s public_key in a single transaction. The id, agentName, role, and createdAt are preserved. Refuses revoked credentials (409 AGENT_CREDENTIAL_REVOKED). Use this for planned key turnover; for emergency invalidation use the revoke endpoint then re-register.',
  })
  async rotate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RotateAgentCredentialDto,
    @Req() req: Request,
  ): Promise<WriteResponseDto<AgentCredentialResponse>> {
    const user = requireUser(req);
    const row = await this.service.rotate(id, user.organizationId, dto.publicKey);
    return toWriteResponse(toResponse(row));
  }

  @Delete(':id')
  @Roles('OWNER')
  @AuditAggregate('agent_credential')
  @ApiOperation({
    summary: 'Hard-delete an agent credential',
    description:
      'Removes the row entirely. Use this only when re-registering an agent under the same agentName after a revocation; otherwise prefer the revoke endpoint.',
  })
  async delete(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: Request,
  ): Promise<WriteResponseDto<{ id: string }>> {
    const user = requireUser(req);
    await this.service.deleteHard(id, user.organizationId);
    return toWriteResponse({ id });
  }
}

function requireUser(req: Request): AuthenticatedUserPayload {
  const user = (req as Request & { user?: AuthenticatedUserPayload }).user;
  if (!user) {
    throw new UnauthorizedException({ code: 'UNAUTHENTICATED' });
  }
  return user;
}

function toResponse(row: AgentCredential): AgentCredentialResponse {
  return {
    id: row.id,
    agentName: row.agentName,
    role: row.role,
    createdAt: row.createdAt.toISOString(),
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
  };
}
