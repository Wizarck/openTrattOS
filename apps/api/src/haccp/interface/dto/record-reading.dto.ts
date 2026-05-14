import { Type } from 'class-transformer';
import {
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class AdHocCorrectiveActionInputDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

/**
 * Request body for `POST /m3/haccp/readings`.
 *
 * Cross-field invariant ENFORCED at the service:
 *  - exactly one of `readingValue` / `readingExtras` MUST be supplied;
 *  - if the resulting reading is out-of-spec, exactly one of
 *    `correctiveActionId` / `correctiveActionInput` MUST be supplied.
 */
export class RecordReadingDto {
  @IsUUID()
  organizationId!: string;

  @IsString()
  @MaxLength(100)
  ccpId!: string;

  @IsOptional()
  @IsUUID()
  fsmsStandardId?: string;

  @IsOptional()
  @IsNumber()
  readingValue?: number;

  @IsOptional()
  @IsObject()
  readingExtras?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  readingUnit?: string;

  @IsOptional()
  @IsUUID()
  correctiveActionId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AdHocCorrectiveActionInputDto)
  correctiveActionInput?: AdHocCorrectiveActionInputDto;
}

export class ListReadingsQueryDto {
  @IsUUID()
  organizationId!: string;

  @IsString()
  @MaxLength(100)
  ccpId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number;
}

export class LastOutOfSpecQueryDto {
  @IsUUID()
  organizationId!: string;
}

