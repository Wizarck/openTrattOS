import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { CcpReading } from '../domain/ccp-reading.entity';
import {
  RECENT_READINGS_DEFAULT_LIMIT,
  RECENT_READINGS_MAX_LIMIT,
} from '../types';

/**
 * Read-only query backing the j10 `RecentReadingsStrip`. Returns the last N
 * readings for a CCP sorted `created_at DESC`. Hard-cap at 50.
 */
@Injectable()
export class RecentReadingsQuery {
  constructor(
    @InjectRepository(CcpReading)
    private readonly repo: Repository<CcpReading>,
  ) {}

  async recentReadings(
    organizationId: string,
    ccpId: string,
    limit: number = RECENT_READINGS_DEFAULT_LIMIT,
  ): Promise<CcpReading[]> {
    const safeLimit = Math.min(
      Math.max(1, Math.floor(limit)),
      RECENT_READINGS_MAX_LIMIT,
    );
    return this.repo.find({
      where: {
        organizationId,
        ccpId,
        deletedAt: IsNull(),
      },
      order: { createdAt: 'DESC' },
      take: safeLimit,
    });
  }
}
