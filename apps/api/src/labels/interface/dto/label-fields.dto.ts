import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  Organization,
  type OrganizationLabelFields,
  type OrganizationLabelPageSize,
} from '../../../iam/domain/organization.entity';

const PAGE_SIZE_VALUES: OrganizationLabelPageSize[] = ['a4', 'thermal-4x6', 'thermal-50x80'];

export class PostalAddressDto {
  @ApiProperty({ example: 'Calle Mayor 1' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  street!: string;

  @ApiProperty({ example: 'Madrid' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  city!: string;

  @ApiProperty({ example: '28001' })
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  postalCode!: string;

  @ApiProperty({ example: 'España' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  country!: string;
}

export class ContactInfoDto {
  @ApiProperty({ required: false, example: 'info@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ required: false, example: '+34 600 000 000' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;
}

export class PrintAdapterConfigDto {
  @ApiProperty({ description: 'Adapter discriminator', example: 'ipp' })
  @IsString()
  @MinLength(1)
  id!: string;

  @ApiProperty({
    description: 'Adapter-specific config (URL, queue, auth credentials)',
    type: 'object',
    additionalProperties: true,
  })
  @IsObject()
  config!: Record<string, unknown>;
}

export class UpdateLabelFieldsDto {
  @ApiProperty({ required: false, example: 'Restaurante Tagliatelle' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  businessName?: string;

  @ApiProperty({ required: false, type: ContactInfoDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ContactInfoDto)
  contactInfo?: ContactInfoDto;

  @ApiProperty({ required: false, type: PostalAddressDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PostalAddressDto)
  postalAddress?: PostalAddressDto;

  @ApiProperty({ required: false, example: 'https://example.com/logo.svg' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  brandMarkUrl?: string;

  @ApiProperty({ required: false, enum: PAGE_SIZE_VALUES })
  @IsOptional()
  @IsIn(PAGE_SIZE_VALUES)
  pageSize?: OrganizationLabelPageSize;

  @ApiProperty({ required: false, type: PrintAdapterConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PrintAdapterConfigDto)
  printAdapter?: PrintAdapterConfigDto;
}

export class LabelFieldsResponseDto {
  @ApiProperty()
  organizationId!: string;

  @ApiProperty({ required: false })
  businessName?: string;

  @ApiProperty({ required: false, type: ContactInfoDto })
  contactInfo?: ContactInfoDto;

  @ApiProperty({ required: false, type: PostalAddressDto })
  postalAddress?: PostalAddressDto;

  @ApiProperty({ required: false })
  brandMarkUrl?: string;

  @ApiProperty({ required: false, enum: PAGE_SIZE_VALUES })
  pageSize?: OrganizationLabelPageSize;

  @ApiProperty({ required: false, type: PrintAdapterConfigDto })
  printAdapter?: PrintAdapterConfigDto;

  static fromEntity(org: Organization): LabelFieldsResponseDto {
    const dto = new LabelFieldsResponseDto();
    dto.organizationId = org.id;
    const f: OrganizationLabelFields = org.labelFields ?? {};
    dto.businessName = f.businessName;
    dto.contactInfo = f.contactInfo;
    dto.postalAddress = f.postalAddress;
    dto.brandMarkUrl = f.brandMarkUrl;
    dto.pageSize = f.pageSize;
    dto.printAdapter = f.printAdapter
      ? { id: f.printAdapter.id, config: f.printAdapter.config }
      : undefined;
    return dto;
  }
}
