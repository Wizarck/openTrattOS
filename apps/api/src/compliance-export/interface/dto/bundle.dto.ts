import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDate,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { LOCALES, SCOPE_KINDS, type Locale, type ScopeKind } from '../../types';

export class GenerateBundleDto {
  @IsUUID()
  organizationId!: string;

  @Type(() => Date)
  @IsDate()
  rangeStart!: Date;

  @Type(() => Date)
  @IsDate()
  rangeEnd!: Date;

  @IsIn(LOCALES as readonly string[])
  locale!: Locale;

  @IsArray()
  @ArrayMaxSize(SCOPE_KINDS.length)
  @IsIn(SCOPE_KINDS as readonly string[], { each: true })
  scope!: ScopeKind[];

  @IsArray()
  @IsOptional()
  @ArrayMinSize(0)
  @ArrayMaxSize(50)
  @IsEmail({}, { each: true })
  recipientEmails?: string[];

  @IsString()
  @IsOptional()
  idempotencyKey?: string;
}

export class BundleQueryDto {
  @IsUUID()
  organizationId!: string;
}

export class ArchiveQueryDto {
  @IsUUID()
  organizationId!: string;

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class DownloadQueryDto {
  @IsString()
  path!: string;

  @Type(() => Number)
  @IsInt()
  exp!: number;

  @IsString()
  token!: string;
}
