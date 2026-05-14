import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { CcpReading } from '../domain/ccp-reading.entity';

/**
 * Probe backing the j10 sticky warning at the top of the surface. Returns
 * the most-recent reading for the given (org, ccp) tuple where
 * `in_spec=false AND corrective_action_id IS NULL`. Returns null when no
 * unresolved out-of-spec reading exists.
 *
 * Used by `GET /m3/haccp/ccps/:ccpId/last-out-of-spec-unresolved` (slice
 * #10 consumer).
 */
@Injectable()
export class OutOfSpecWithoutActionQuery {
  constructor(
    @InjectRepository(CcpReading)
    private readonly repo: Repository<CcpReading>,
  ) {}

  async lastOutOfSpecUnresolved(
    organizationId: string,
    ccpId: string,
  ): Promise<CcpReading | null> {
    return this.repo.findOne({
      where: {
        organizationId,
        ccpId,
        inSpec: false,
        correctiveActionId: IsNull(),
        deletedAt: IsNull(),
      },
      order: { createdAt: 'DESC' },
    });
  }
}
