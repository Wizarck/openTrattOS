import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Roles } from '../../shared/decorators/roles.decorator';
import { AuthenticatedUserPayload } from '../../shared/guards/roles.guard';
import { CorrectiveActionService } from '../application/corrective-action.service';
import {
  ListCorrectiveActionsQueryDto,
  RecordCorrectiveActionDto,
} from './dto/record-corrective-action.dto';

/**
 * REST surface for corrective actions.
 *
 * RBAC: `OWNER` + `MANAGER` (mirrors j10's picker surface — Carmen + Iker
 * surface them on the same screen). STAFF rejected at 403.
 */
@ApiTags('m3-haccp')
@Controller('m3/haccp/corrective-actions')
export class CorrectiveActionController {
  constructor(private readonly correctiveActions: CorrectiveActionService) {}

  @Post()
  @Roles('OWNER', 'MANAGER')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Record a predefined corrective action' })
  async record(
    @Body() dto: RecordCorrectiveActionDto,
    @Req() req: Request,
  ) {
    const user = requireUser(req);
    this.assertOrgMatch(user, dto.organizationId);
    const correctiveAction = await this.correctiveActions.recordPredefined({
      organizationId: dto.organizationId,
      fsmsStandardId: dto.fsmsStandardId,
      ccpId: dto.ccpId,
      name: dto.name,
      notes: dto.notes,
      actorUserId: user.userId,
    });
    return { correctiveAction };
  }

  @Get()
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({ summary: 'List corrective actions for a CCP' })
  async list(
    @Query() query: ListCorrectiveActionsQueryDto,
    @Req() req: Request,
  ) {
    const user = requireUser(req);
    this.assertOrgMatch(user, query.organizationId);
    const correctiveActions = await this.correctiveActions.listForCcp(
      query.organizationId,
      query.fsmsStandardId,
      query.ccpId,
    );
    return { correctiveActions };
  }

  private assertOrgMatch(
    user: AuthenticatedUserPayload,
    bodyOrgId: string,
  ): void {
    if (user.organizationId !== bodyOrgId) {
      throw new ForbiddenException({
        code: 'CROSS_ORG_FORBIDDEN',
        message: 'organizationId does not match authenticated org',
      });
    }
  }
}

function requireUser(req: Request): AuthenticatedUserPayload {
  const user = (req as Request & { user?: AuthenticatedUserPayload }).user;
  if (!user) {
    throw new UnauthorizedException({ code: 'UNAUTHENTICATED' });
  }
  return user;
}
