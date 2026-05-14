import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Roles } from '../../shared/decorators/roles.decorator';
import { AuthenticatedUserPayload } from '../../shared/guards/roles.guard';
import { FsmsStandardService } from '../application/fsms-standard.service';
import {
  FsmsStandardConflictError,
  FsmsStandardNotFoundError,
} from '../domain/errors';
import {
  ConfigureFsmsStandardDto,
  ListFsmsStandardsQueryDto,
} from './dto/configure-fsms-standard.dto';

/**
 * REST surface for FSMS standards.
 *
 * RBAC: `OWNER` only — Manager + Staff rejected at 403. Per design.md
 * Decision E, the Owner is the FSMS authority for the organization.
 */
@ApiTags('m3-haccp')
@Controller('m3/haccp/fsms-standards')
export class FsmsStandardController {
  constructor(private readonly fsms: FsmsStandardService) {}

  @Post()
  @Roles('OWNER')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Publish a new FSMS standard version' })
  async create(
    @Body() dto: ConfigureFsmsStandardDto,
    @Req() req: Request,
  ) {
    const user = requireUser(req);
    this.assertOrgMatch(user, dto.organizationId);
    try {
      const fsmsStandard = await this.fsms.configureFsmsStandards({
        organizationId: dto.organizationId,
        name: dto.name,
        version: dto.version,
        effectiveFrom: dto.effectiveFrom,
        effectiveUntil: dto.effectiveUntil ?? null,
        ccpDefinitions: dto.ccpDefinitions,
        terminatesPrior: dto.terminatesPrior ?? false,
        actorUserId: user.userId,
      });
      return { fsmsStandard };
    } catch (err) {
      if (err instanceof FsmsStandardConflictError) {
        throw new UnprocessableEntityException({
          code: err.code,
          message: err.message,
        });
      }
      throw err;
    }
  }

  @Put(':id')
  @Roles('OWNER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Republish an FSMS standard (creates a new row; existing rows are immutable per design.md Decision A)',
  })
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ConfigureFsmsStandardDto,
    @Req() req: Request,
  ) {
    // Per design.md Decision A: existing rows are append-only; "update"
    // creates a new row with a new version. The `:id` parameter validates
    // the existing row exists so a 422 surface distinguishes "id typo"
    // from "happy path".
    const user = requireUser(req);
    this.assertOrgMatch(user, dto.organizationId);
    try {
      await this.fsms.getStandardById(user.organizationId, id);
    } catch (err) {
      if (err instanceof FsmsStandardNotFoundError) {
        throw new UnprocessableEntityException({
          code: err.code,
          message: err.message,
        });
      }
      throw err;
    }
    return this.create(dto, req);
  }

  @Get()
  @Roles('OWNER')
  @ApiOperation({ summary: 'List FSMS standards for the organization' })
  async list(
    @Query() query: ListFsmsStandardsQueryDto,
    @Req() req: Request,
  ) {
    const user = requireUser(req);
    this.assertOrgMatch(user, query.organizationId);
    const fsmsStandards = await this.fsms.listVersions(
      query.organizationId,
      query.name,
    );
    return { fsmsStandards };
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
