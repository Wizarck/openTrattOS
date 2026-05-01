import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Length, Matches } from 'class-validator';
import { Supplier } from '../../domain/supplier.entity';
import { SupplierItem } from '../../domain/supplier-item.entity';

export class CreateSupplierDto {
  @ApiProperty() @IsUUID('4') organizationId!: string;
  @ApiProperty() @IsString() @Length(1, 200) name!: string;
  @ApiProperty({ description: 'ISO 3166-1 alpha-2', example: 'ES' }) @Matches(/^[A-Z]{2}$/) country!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 200) contactName?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 32) phone?: string;
}

export class UpdateSupplierDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 200) name?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^[A-Z]{2}$/) country?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 200) contactName?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 32) phone?: string;
}

export class SupplierResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() organizationId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() country!: string;
  @ApiProperty({ type: String, nullable: true }) contactName!: string | null;
  @ApiProperty({ type: String, nullable: true }) email!: string | null;
  @ApiProperty({ type: String, nullable: true }) phone!: string | null;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;

  static fromEntity(s: Supplier): SupplierResponseDto {
    return {
      id: s.id,
      organizationId: s.organizationId,
      name: s.name,
      country: s.country,
      contactName: s.contactName,
      email: s.email,
      phone: s.phone,
      isActive: s.isActive,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    };
  }
}

export class CreateSupplierItemDto {
  @ApiProperty() @IsUUID('4') supplierId!: string;
  @ApiProperty() @IsUUID('4') ingredientId!: string;
  @ApiProperty({ example: '5 kg Box' }) @IsString() @Length(1, 100) purchaseUnit!: string;
  @ApiProperty({ example: 5 }) @IsNumber() @IsPositive() purchaseUnitQty!: number;
  @ApiProperty({ example: 'kg' }) @IsString() @Length(1, 16) purchaseUnitType!: string;
  @ApiProperty({ example: 25 }) @IsNumber() @IsPositive() unitPrice!: number;
  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() isPreferred?: boolean;
}

export class UpdateSupplierItemDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 100) purchaseUnit?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @IsPositive() purchaseUnitQty?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 16) purchaseUnitType?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @IsPositive() unitPrice?: number;
}

export class SupplierItemResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() supplierId!: string;
  @ApiProperty() ingredientId!: string;
  @ApiProperty() purchaseUnit!: string;
  @ApiProperty() purchaseUnitQty!: number;
  @ApiProperty() purchaseUnitType!: string;
  @ApiProperty() unitPrice!: number;
  @ApiProperty({ type: Number, nullable: true }) costPerBaseUnit!: number | null;
  @ApiProperty() isPreferred!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;

  static fromEntity(si: SupplierItem): SupplierItemResponseDto {
    return {
      id: si.id,
      supplierId: si.supplierId,
      ingredientId: si.ingredientId,
      purchaseUnit: si.purchaseUnit,
      purchaseUnitQty: si.purchaseUnitQty,
      purchaseUnitType: si.purchaseUnitType,
      unitPrice: si.unitPrice,
      costPerBaseUnit: si.costPerBaseUnit !== null ? Number(si.costPerBaseUnit) : null,
      isPreferred: si.isPreferred,
      createdAt: si.createdAt,
      updatedAt: si.updatedAt,
    };
  }
}
