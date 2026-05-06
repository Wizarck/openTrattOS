import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsDate,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  AUDIT_LOG_DEFAULT_LIMIT,
  AUDIT_LOG_MAX_LIMIT,
} from '../../application/audit-log.service';
import { AUDIT_ACTOR_KINDS, AuditActorKind } from '../../domain/audit-log.entity';

/**
 * GET /audit-log query parameters. `organizationId` is required; everything
 * else narrows the result. `eventType` accepts comma-separated values for OR.
 */
export class AuditLogQueryDto {
  @IsUUID()
  organizationId!: string;

  @IsOptional()
  @IsString()
  aggregateType?: string;

  @IsOptional()
  @IsUUID()
  aggregateId?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value as string[];
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }
    return value as unknown;
  })
  @IsArray()
  @IsString({ each: true })
  eventType?: string[];

  @IsOptional()
  @IsUUID()
  actorUserId?: string;

  @IsOptional()
  @IsIn(AUDIT_ACTOR_KINDS)
  actorKind?: AuditActorKind;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  since?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  until?: Date;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(AUDIT_LOG_MAX_LIMIT)
  limit?: number = AUDIT_LOG_DEFAULT_LIMIT;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;

  /**
   * Optional full-text search term. Length-capped at 200 to prevent
   * payload-bombing; `plainto_tsquery` handles pathological-looking input
   * safely (it's tokenised, not regex). When set, results are ranked by
   * relevance + recency tiebreaker against the dual-config GIN index.
   */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}
