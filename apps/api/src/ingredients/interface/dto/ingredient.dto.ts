import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Length } from 'class-validator';
import { BaseUnitType, Ingredient } from '../../domain/ingredient.entity';

const BASE_UNIT_TYPES = ['WEIGHT', 'VOLUME', 'UNIT'] as const;

export class CreateIngredientDto {
  @ApiProperty() @IsUUID('4') organizationId!: string;
  @ApiProperty() @IsUUID('4') categoryId!: string;
  @ApiProperty() @IsString() @Length(1, 200) name!: string;
  @ApiProperty({ enum: BASE_UNIT_TYPES }) @IsEnum(BASE_UNIT_TYPES) baseUnitType!: BaseUnitType;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 64) internalCode?: string;
  @ApiPropertyOptional({ description: 'g/ml; required for WEIGHT↔VOLUME conversion; forbidden for UNIT' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  densityFactor?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class UpdateIngredientDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID('4') categoryId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 200) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 64) internalCode?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  densityFactor?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string | null;
}

export class IngredientResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() organizationId!: string;
  @ApiProperty() categoryId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() internalCode!: string;
  @ApiProperty({ enum: BASE_UNIT_TYPES }) baseUnitType!: BaseUnitType;
  @ApiProperty({ type: Number, nullable: true }) densityFactor!: number | null;
  @ApiProperty({ type: String, nullable: true }) notes!: string | null;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;

  static fromEntity(i: Ingredient): IngredientResponseDto {
    return {
      id: i.id,
      organizationId: i.organizationId,
      categoryId: i.categoryId,
      name: i.name,
      internalCode: i.internalCode,
      baseUnitType: i.baseUnitType,
      densityFactor: i.densityFactor,
      notes: i.notes,
      isActive: i.isActive,
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
    };
  }
}
