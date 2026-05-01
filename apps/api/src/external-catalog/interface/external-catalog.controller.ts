import {
  Controller,
  Get,
  HttpCode,
  Logger,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../shared/decorators/roles.decorator';
import { ExternalCatalogService } from '../application/external-catalog.service';
import { OffSyncInProgressError } from '../application/off-api.types';
import { OffSyncService, SyncRunResult } from '../application/off-sync.service';
import { ExternalFoodCatalogRepository } from '../infrastructure/external-food-catalog.repository';

const STALE_THRESHOLD_DAYS = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface HealthCheckResponseDto {
  lastSyncAt: string | null;
  rowCount: number;
  stale: boolean;
}

export interface SyncResponseDto {
  jobId: string;
  status: 'completed';
  results: SyncRunResult[];
}

@ApiTags('External Catalog (OFF mirror)')
@Controller()
export class ExternalCatalogController {
  private readonly logger = new Logger(ExternalCatalogController.name);

  constructor(
    private readonly catalog: ExternalFoodCatalogRepository,
    private readonly externalCatalog: ExternalCatalogService,
    private readonly syncService: OffSyncService,
  ) {
    // ExternalCatalogService is currently unused at the controller layer
    // (consumed by #5 m2-ingredients-extension); keep the binding for the
    // module surface to be ready when the picker controller lands.
    void this.externalCatalog;
  }

  @Get('health/external-catalog')
  @ApiOperation({
    summary: 'Health check for the OFF local mirror',
    description: 'Returns last successful sync timestamp, total row count, and a stale flag (>14 days).',
  })
  async healthCheck(): Promise<HealthCheckResponseDto> {
    const stats = await this.catalog.getStats();
    const stale = isStale(stats.lastSyncAt);
    return {
      lastSyncAt: stats.lastSyncAt ? stats.lastSyncAt.toISOString() : null,
      rowCount: stats.rowCount,
      stale,
    };
  }

  @Post('external-catalog/sync')
  @Roles('OWNER')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Manually trigger an OFF sync (Owner only)',
    description:
      'Runs a region-scoped incremental sync inline. Returns 202 Accepted with a job id and per-region results.',
  })
  async triggerSync(): Promise<SyncResponseDto> {
    const jobId = `off-sync-${Date.now()}`;
    try {
      const results = await this.syncService.syncAll();
      return { jobId, status: 'completed', results };
    } catch (err) {
      if (err instanceof OffSyncInProgressError) {
        throw new ServiceUnavailableException({ code: 'EXTERNAL_CATALOG_SYNC_IN_PROGRESS' });
      }
      this.logger.error(
        `Manual OFF sync failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new ServiceUnavailableException({ code: 'EXTERNAL_CATALOG_OFF_OUTAGE' });
    }
  }
}

function isStale(lastSyncAt: Date | null): boolean {
  if (!lastSyncAt) return true;
  const ageMs = Date.now() - lastSyncAt.getTime();
  return ageMs > STALE_THRESHOLD_DAYS * MS_PER_DAY;
}
