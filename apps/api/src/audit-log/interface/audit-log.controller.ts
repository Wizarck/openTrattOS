import {
  Controller,
  Get,
  Query,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../shared/decorators/roles.decorator';
import { AuditLogService } from '../application/audit-log.service';
import { AuditLogQueryError } from '../application/errors';
import { AuditLog } from '../domain/audit-log.entity';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import {
  AuditLogPageDto,
  AuditLogResponseDto,
} from './dto/audit-log-response.dto';

/**
 * GET /audit-log — canonical cross-BC audit query.
 *
 * RBAC: Owner + Manager only. Staff blocked at 403 by the global RolesGuard.
 * Multi-tenant: `organizationId` is required and enforced by the global
 * `OrganizationGuard` upstream of this controller.
 *
 * Defaults: 30-day window when `since`/`until` omitted; 50 rows per page.
 * Maximum 200 rows per page (enforced both at DTO + service layers).
 */
@ApiTags('audit-log')
@Controller('audit-log')
export class AuditLogController {
  constructor(private readonly auditLog: AuditLogService) {}

  @Get()
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({ summary: 'Query the audit log with filters and pagination.' })
  async query(@Query() query: AuditLogQueryDto): Promise<AuditLogPageDto> {
    try {
      const page = await this.auditLog.query({
        organizationId: query.organizationId,
        aggregateType: query.aggregateType,
        aggregateId: query.aggregateId,
        eventTypes: query.eventType,
        actorUserId: query.actorUserId,
        actorKind: query.actorKind,
        since: query.since,
        until: query.until,
        limit: query.limit,
        offset: query.offset,
        q: query.q,
      });
      return {
        rows: page.rows.map(toResponseDto),
        total: page.total,
        limit: page.limit,
        offset: page.offset,
      };
    } catch (err) {
      if (err instanceof AuditLogQueryError) {
        throw new UnprocessableEntityException({ code: err.code, message: err.message });
      }
      throw err;
    }
  }
}

function toResponseDto(row: AuditLog): AuditLogResponseDto {
  return {
    id: row.id,
    eventType: row.eventType,
    aggregateType: row.aggregateType,
    aggregateId: row.aggregateId,
    actorUserId: row.actorUserId,
    actorKind: row.actorKind,
    agentName: row.agentName,
    payloadBefore: row.payloadBefore,
    payloadAfter: row.payloadAfter,
    reason: row.reason,
    citationUrl: row.citationUrl,
    snippet: row.snippet,
    createdAt: row.createdAt.toISOString(),
  };
}
