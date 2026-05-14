import { Readable } from 'node:stream';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  Sse,
  StreamableFile,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { Roles } from '../../shared/decorators/roles.decorator';
import { AuthenticatedUserPayload } from '../../shared/guards/roles.guard';
import { BundleArchiveQuery } from '../application/bundle-archive.query';
import {
  BundleGeneratorService,
  type BundleProgressEvent,
} from '../application/bundle-generator.service';
import { BundleStatusQuery } from '../application/bundle-status.query';
import {
  BUNDLE_STORAGE,
  type BundleStorage,
} from '../storage/bundle-storage';
import { LocalBundleStorage } from '../storage/local-bundle-storage';
import {
  ArchiveQueryDto,
  BundleQueryDto,
  DownloadQueryDto,
  GenerateBundleDto,
} from './dto/bundle.dto';

/**
 * REST surface for the APPCC compliance-export BC under `/m3/compliance/exports`.
 *
 * RBAC: `OWNER` + `MANAGER` per j9.md persona + AC-COMP-6. Manager
 * implicitly scope-restricted via `req.user.locationIds` (passed through
 * to the generator; chapter 0 stays tenant-scoped per
 * ADR-RBAC-MANAGER-LOCATION-SCOPED).
 *
 * Multi-tenant: every endpoint asserts `req.user.organizationId` matches
 * the body / query `organizationId` to block cross-org access.
 */
@ApiTags('m3-compliance')
@Controller('m3/compliance/exports')
export class BundleController {
  constructor(
    private readonly generator: BundleGeneratorService,
    private readonly archive: BundleArchiveQuery,
    private readonly statusQuery: BundleStatusQuery,
    @Inject(BUNDLE_STORAGE) private readonly storage: BundleStorage,
  ) {}

  @Post()
  @Roles('OWNER', 'MANAGER')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Generate an APPCC export bundle (J9 trigger).' })
  async generate(@Body() dto: GenerateBundleDto, @Req() req: Request) {
    const user = requireUser(req);
    assertOrgMatch(user, dto.organizationId);
    const locationIds = readLocationIds(user);
    const outcome = await this.generator.generate({
      organizationId: dto.organizationId,
      requestedByUserId: user.userId,
      actorKind: 'user',
      rangeStart: dto.rangeStart,
      rangeEnd: dto.rangeEnd,
      locale: dto.locale,
      scope: dto.scope,
      recipientEmails: dto.recipientEmails,
      locationIds,
    });
    return {
      bundleId: outcome.bundleId,
      status: outcome.status,
      recipientReceipts: outcome.receipts,
    };
  }

  @Get()
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({ summary: 'List recent bundles (J9 archive table).' })
  async listRecent(@Query() query: ArchiveQueryDto, @Req() req: Request) {
    const user = requireUser(req);
    assertOrgMatch(user, query.organizationId);
    const rows = await this.archive.recentBundles(query.organizationId, query.limit);
    return { rows };
  }

  @Get('download')
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({
    summary: 'Validate a signed bundle URL + stream the bytes.',
  })
  async downloadSigned(
    @Query() query: DownloadQueryDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    requireUser(req);
    if (!(this.storage instanceof LocalBundleStorage)) {
      throw new BadRequestException({
        code: 'SIGNED_DOWNLOAD_UNSUPPORTED',
        message: 'configured storage backend does not support signed URLs',
      });
    }
    const ok = (this.storage as LocalBundleStorage).verify(
      query.path,
      query.exp,
      query.token,
    );
    if (!ok) {
      throw new ForbiddenException({ code: 'SIGNED_URL_INVALID_OR_EXPIRED' });
    }
    const bytes = await this.storage.readBundle(query.path);
    const isCsv = query.path.endsWith('csv.bin');
    res.setHeader(
      'Content-Type',
      isCsv ? 'text/csv; charset=utf-8' : 'application/pdf',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${derivedFilename(query.path, isCsv)}"`,
    );
    return new StreamableFile(Readable.from([bytes]));
  }

  @Get(':bundleId')
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({ summary: 'Bundle status + signed download links.' })
  async getStatus(
    @Param('bundleId', new ParseUUIDPipe()) bundleId: string,
    @Query() query: BundleQueryDto,
    @Req() req: Request,
  ) {
    const user = requireUser(req);
    assertOrgMatch(user, query.organizationId);
    return this.statusQuery.getBundleStatus(query.organizationId, bundleId);
  }

  @Get(':bundleId/pdf')
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({ summary: 'Stream the bundle PDF.' })
  async downloadPdf(
    @Param('bundleId', new ParseUUIDPipe()) bundleId: string,
    @Query() query: BundleQueryDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return this.streamAsset(bundleId, query.organizationId, 'pdf', req, res);
  }

  @Get(':bundleId/csv')
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({ summary: 'Stream the bundle CSV companion.' })
  async downloadCsv(
    @Param('bundleId', new ParseUUIDPipe()) bundleId: string,
    @Query() query: BundleQueryDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    return this.streamAsset(bundleId, query.organizationId, 'csv', req, res);
  }

  @Sse(':bundleId/stream')
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({
    summary: 'SSE progress strip — step events while the bundle generates.',
  })
  streamProgress(
    @Param('bundleId', new ParseUUIDPipe()) bundleId: string,
    @Query() query: BundleQueryDto,
    @Req() req: Request,
  ): Observable<{ data: BundleProgressEvent }> {
    const user = requireUser(req);
    assertOrgMatch(user, query.organizationId);
    const bus = this.generator.progressStream(bundleId);
    return new Observable((subscriber) => {
      const handler = (event: BundleProgressEvent): void => {
        subscriber.next({ data: event });
        if (event.step === 'ready' || event.step === 'failed') {
          subscriber.complete();
        }
      };
      bus.on('progress', handler);
      return () => bus.off('progress', handler);
    });
  }

  private async streamAsset(
    bundleId: string,
    organizationId: string,
    kind: 'pdf' | 'csv',
    req: Request,
    res: Response,
  ): Promise<StreamableFile> {
    const user = requireUser(req);
    assertOrgMatch(user, organizationId);
    const view = await this.statusQuery.getBundleStatus(organizationId, bundleId);
    if (view.status !== 'ready') {
      throw new ConflictException({
        code: 'BUNDLE_NOT_READY',
        status: view.status,
      });
    }
    const path =
      kind === 'pdf'
        ? extractPath(view.pdfDownloadUrl)
        : extractPath(view.csvDownloadUrl);
    if (!path) {
      throw new ConflictException({ code: 'BUNDLE_NOT_READY' });
    }
    const bytes = await this.storage.readBundle(path);
    res.setHeader(
      'Content-Type',
      kind === 'pdf' ? 'application/pdf' : 'text/csv; charset=utf-8',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="appcc-export-${bundleId}.${kind}"`,
    );
    return new StreamableFile(Readable.from([bytes]));
  }
}

function requireUser(req: Request): AuthenticatedUserPayload {
  const user = (req as Request & { user?: AuthenticatedUserPayload }).user;
  if (!user) {
    throw new UnauthorizedException({ code: 'UNAUTHENTICATED' });
  }
  return user;
}

function assertOrgMatch(user: AuthenticatedUserPayload, bodyOrgId: string): void {
  if (user.organizationId !== bodyOrgId) {
    throw new ForbiddenException({
      code: 'CROSS_ORG_FORBIDDEN',
      message: 'organizationId does not match authenticated org',
    });
  }
}

function readLocationIds(user: AuthenticatedUserPayload): string[] | undefined {
  const ids = (user as AuthenticatedUserPayload & {
    locationIds?: string[];
  }).locationIds;
  return Array.isArray(ids) && ids.length > 0 ? ids : undefined;
}

function extractPath(signedUrl: string | null): string | null {
  if (!signedUrl) return null;
  try {
    const url = new URL(signedUrl, 'http://placeholder.invalid');
    return url.searchParams.get('path');
  } catch {
    return null;
  }
}

function derivedFilename(storagePath: string, isCsv: boolean): string {
  const segments = storagePath.split('/');
  const bundleId = segments.length >= 2 ? segments[segments.length - 2] : 'bundle';
  return `appcc-export-${bundleId}.${isCsv ? 'csv' : 'pdf'}`;
}
