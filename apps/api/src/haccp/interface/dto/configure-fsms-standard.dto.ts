import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CCP_INPUT_TYPES, CcpInputType } from '../../types';

export class CcpDefinitionDto {
  @IsString()
  @MaxLength(100)
  id!: string;

  @IsString()
  @MaxLength(200)
  label!: string;

  @IsIn(CCP_INPUT_TYPES)
  inputType!: CcpInputType;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

  @IsOptional()
  @IsNumber()
  specMin?: number;

  @IsOptional()
  @IsNumber()
  specMax?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  expectedOptions?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  recommendedCorrectiveActionIds?: string[];
}

export class ConfigureFsmsStandardDto {
  @IsUUID()
  organizationId!: string;

  @IsString()
  @MaxLength(200)
  name!: string;

  @IsString()
  @MaxLength(50)
  version!: string;

  @Type(() => Date)
  @IsDate()
  effectiveFrom!: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  effectiveUntil?: Date;

  @IsArray()
  @ArrayMinSize(0)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CcpDefinitionDto)
  ccpDefinitions!: CcpDefinitionDto[];

  @IsOptional()
  @IsBoolean()
  terminatesPrior?: boolean;
}

export class ListFsmsStandardsQueryDto {
  @IsUUID()
  organizationId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;
}
