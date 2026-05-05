import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

const SUPPORTED_LOCALES = ['es', 'en', 'it'] as const;

export class PrintLabelDto {
  @ApiProperty({ required: false, enum: SUPPORTED_LOCALES, default: undefined })
  @IsOptional()
  @IsIn(SUPPORTED_LOCALES)
  locale?: 'es' | 'en' | 'it';

  @ApiProperty({ required: false, default: 1, minimum: 1, maximum: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  copies?: number;

  @ApiProperty({ required: false, description: 'Override which configured printer to dispatch to.' })
  @IsOptional()
  @IsString()
  printerId?: string;

  @ApiProperty({ description: 'Organization id (multi-tenant scope).', example: 'uuid' })
  @IsUUID('4')
  organizationId!: string;
}

export class PrintLabelResponseDto {
  @ApiProperty()
  ok!: boolean;

  @ApiProperty({ required: false, description: 'Adapter-assigned job id when supported.' })
  jobId?: string;
}
