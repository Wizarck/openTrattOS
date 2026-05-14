import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class RecordCorrectiveActionDto {
  @IsUUID()
  organizationId!: string;

  @IsUUID()
  fsmsStandardId!: string;

  @IsString()
  @MaxLength(100)
  ccpId!: string;

  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class ListCorrectiveActionsQueryDto {
  @IsUUID()
  organizationId!: string;

  @IsUUID()
  fsmsStandardId!: string;

  @IsString()
  @MaxLength(100)
  ccpId!: string;
}

