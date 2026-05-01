import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, Matches } from 'class-validator';
import { Organization } from '../../domain/organization.entity';

export class CreateOrganizationDto {
  @ApiProperty({ example: 'Acme Restaurants S.L.' })
  @IsString()
  @Length(1, 200)
  name!: string;

  @ApiProperty({ example: 'EUR', description: 'ISO 4217 3-letter code; immutable post-creation' })
  @Matches(/^[A-Z]{3}$/)
  currencyCode!: string;

  @ApiProperty({ example: 'es', description: 'ISO 639-1 2-letter lowercase' })
  @Matches(/^[a-z]{2}$/)
  defaultLocale!: string;

  @ApiProperty({ example: 'Europe/Madrid', description: 'IANA timezone' })
  @IsString()
  @Length(1, 64)
  timezone!: string;
}

export class UpdateOrganizationDto {
  @ApiPropertyOptional({ example: 'Acme Restaurants Renamed S.L.' })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;

  @ApiPropertyOptional({ example: 'en' })
  @IsOptional()
  @Matches(/^[a-z]{2}$/)
  defaultLocale?: string;

  @ApiPropertyOptional({ example: 'America/New_York' })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  timezone?: string;
}

export class OrganizationResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() currencyCode!: string;
  @ApiProperty() defaultLocale!: string;
  @ApiProperty() timezone!: string;
  @ApiProperty({ type: String, nullable: true }) createdBy!: string | null;
  @ApiProperty({ type: String, nullable: true }) updatedBy!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;

  static fromEntity(org: Organization): OrganizationResponseDto {
    return {
      id: org.id,
      name: org.name,
      currencyCode: org.currencyCode,
      defaultLocale: org.defaultLocale,
      timezone: org.timezone,
      createdBy: org.createdBy,
      updatedBy: org.updatedBy,
      createdAt: org.createdAt,
      updatedAt: org.updatedAt,
    };
  }
}
