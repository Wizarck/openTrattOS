import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Roles } from '../../shared/decorators/roles.decorator';
import { AuthenticatedUserPayload } from '../../shared/guards/roles.guard';
import { CcpReadingService } from '../application/ccp-reading.service';
import { OutOfSpecWithoutActionQuery } from '../application/out-of-spec-without-action.query';
import { RecentReadingsQuery } from '../application/recent-readings.query';
import {
  CcpNotInFsmsStandardError,
  CorrectiveActionNotFoundError,
  FsmsStandardNotFoundError,
  OutOfSpecRequiresCorrectiveActionError,
  ReadingShapeError,
} from '../domain/errors';
import {
  LastOutOfSpecQueryDto,
  ListReadingsQueryDto,
  RecordReadingDto,
} from './dto/record-reading.dto';

/**
 * REST surface for CCP readings.
 *
 * RBAC: `OWNER` + `MANAGER` per j10 §RBAC. The global `RolesGuard` enforces.
 * STAFF rejected at 403; Staff-via-Hermes flows the agent context through
 * the MCP capability rather than direct REST.
 *
 * Multi-tenant: every endpoint asserts `dto.organizationId === req.user.organizationId`.
 */
@ApiTags('m3-haccp')
@Controller('m3/haccp')
export class CcpReadingController {
  constructor(
    private readonly readings: CcpReadingService,
    private readonly recent: RecentReadingsQuery,
    private readonly outOfSpecProbe: OutOfSpecWithoutActionQuery,
  ) {}

  @Post('readings')
  @Roles('OWNER', 'MANAGER')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Record a CCP reading (FR9, FR10, FR12, FR13)' })
  async record(@Body() dto: RecordReadingDto, @Req() req: Request) {
    const user = requireUser(req);
    this.assertOrgMatch(user, dto.organizationId);
    try {
      const reading = await this.readings.recordReading({
        organizationId: dto.organizationId,
        ccpId: dto.ccpId,
        fsmsStandardId: dto.fsmsStandardId,
        readingValue: dto.readingValue ?? null,
        readingExtras: dto.readingExtras ?? null,
        readingUnit: dto.readingUnit ?? null,
        correctiveActionId: dto.correctiveActionId,
        correctiveActionInput: dto.correctiveActionInput,
        actorUserId: user.userId,
      });
      return { reading };
    } catch (err) {
      if (err instanceof OutOfSpecRequiresCorrectiveActionError) {
        throw new UnprocessableEntityException({
          code: err.code,
          message: err.message,
        });
      }
      if (err instanceof CcpNotInFsmsStandardError) {
        throw new UnprocessableEntityException({
          code: err.code,
          message: err.message,
        });
      }
      if (err instanceof FsmsStandardNotFoundError) {
        throw new UnprocessableEntityException({
          code: err.code,
          message: err.message,
        });
      }
      if (err instanceof CorrectiveActionNotFoundError) {
        throw new UnprocessableEntityException({
          code: err.code,
          message: err.message,
        });
      }
      if (err instanceof ReadingShapeError) {
        throw new UnprocessableEntityException({
          code: err.code,
          message: err.message,
        });
      }
      throw err;
    }
  }

  @Get('readings')
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({ summary: 'Recent CCP readings for a given CCP' })
  async list(@Query() query: ListReadingsQueryDto, @Req() req: Request) {
    const user = requireUser(req);
    this.assertOrgMatch(user, query.organizationId);
    const readings = await this.recent.recentReadings(
      query.organizationId,
      query.ccpId,
      query.limit,
    );
    return { readings };
  }

  @Get('ccps/:ccpId/last-out-of-spec-unresolved')
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({
    summary:
      'Most recent out-of-spec reading without a corrective action — drives j10 sticky warning',
  })
  async lastOutOfSpecUnresolved(
    @Param('ccpId') ccpId: string,
    @Query() query: LastOutOfSpecQueryDto,
    @Req() req: Request,
  ) {
    const user = requireUser(req);
    this.assertOrgMatch(user, query.organizationId);
    const reading = await this.outOfSpecProbe.lastOutOfSpecUnresolved(
      query.organizationId,
      ccpId,
    );
    return { reading };
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
