import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { Location, LocationType } from '../../domain/location.entity';

const LOCATION_TYPES = ['RESTAURANT', 'BAR', 'DARK_KITCHEN', 'CATERING', 'CENTRAL_PRODUCTION'] as const;

export class CreateLocationDto {
  @ApiProperty() @IsUUID('4') organizationId!: string;
  @ApiProperty() @IsString() @Length(1, 200) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 500) address?: string;
  @ApiProperty({ enum: LOCATION_TYPES }) @IsEnum(LOCATION_TYPES) type!: LocationType;
}

export class UpdateLocationDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 200) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 500) address?: string;
  @ApiPropertyOptional({ enum: LOCATION_TYPES })
  @IsOptional()
  @IsEnum(LOCATION_TYPES)
  type?: LocationType;
}

export class LocationResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() organizationId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() address!: string;
  @ApiProperty({ enum: LOCATION_TYPES }) type!: LocationType;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;

  static fromEntity(l: Location): LocationResponseDto {
    return {
      id: l.id,
      organizationId: l.organizationId,
      name: l.name,
      address: l.address,
      type: l.type,
      isActive: l.isActive,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    };
  }
}
