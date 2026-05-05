import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Length, MinLength } from 'class-validator';
import {
  BaseUnitType,
  Ingredient,
  IngredientOverridableField,
  OVERRIDABLE_FIELDS,
} from '../../domain/ingredient.entity';

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
  @ApiProperty({ type: Object, nullable: true }) nutrition!: Record<string, unknown> | null;
  @ApiProperty({ type: [String] }) allergens!: string[];
  @ApiProperty({ type: [String] }) dietFlags!: string[];
  @ApiProperty({ type: String, nullable: true }) brandName!: string | null;
  @ApiProperty({ type: String, nullable: true }) externalSourceRef!: string | null;
  @ApiProperty({
    type: Object,
    description: 'Manager+ overrides per field. Empty object when no overrides applied.',
  })
  overrides!: Record<string, unknown>;
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
      nutrition: i.nutrition,
      allergens: i.allergens,
      dietFlags: i.dietFlags,
      brandName: i.brandName,
      externalSourceRef: i.externalSourceRef,
      overrides: (i.overrides ?? {}) as Record<string, unknown>,
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
    };
  }
}

export class ApplyIngredientOverrideDto {
  @ApiProperty({ enum: OVERRIDABLE_FIELDS })
  @IsEnum(OVERRIDABLE_FIELDS)
  field!: IngredientOverridableField;

  @ApiProperty({ description: 'Value matching the overridden field shape (string[], jsonb, or string).' })
  value!: unknown;

  @ApiProperty({ description: 'Auditable reason; minimum 10 characters.' })
  @IsString()
  @MinLength(10)
  reason!: string;

  @ApiProperty({ description: 'UUID of the actor applying the override (Manager+).' })
  @IsUUID('4')
  actorUserId!: string;
}

export class IngredientSearchResultDto {
  @ApiProperty({ enum: ['off', 'local'] }) source!: 'off' | 'local';
  @ApiProperty() barcode!: string;
  @ApiProperty({ type: String, nullable: true }) brandName!: string | null;
  @ApiProperty() name!: string;
  @ApiProperty({ type: Object, nullable: true }) nutrition!: unknown;
  @ApiProperty({ type: [String] }) allergens!: string[];
  @ApiProperty({ type: [String] }) dietFlags!: string[];
  @ApiProperty({ description: 'OFF licence + attribution required by ODbL when source = "off".' })
  licenseAttribution!: string;
}

export class MacroRollupDto {
  @ApiProperty({ type: Object, description: 'Per-portion macro totals (kcal + protein/fat/carbs etc).' })
  perPortion!: Record<string, number>;
  @ApiProperty({ type: Object, description: 'Per-100g macros (empty when total weight not trackable).' })
  per100g!: Record<string, number>;
  @ApiProperty({ type: Number, nullable: true })
  totalWeightG!: number | null;
  @ApiProperty({
    type: [Object],
    description: 'Ingredient/externalSourceRef pairs for ODbL attribution rendering.',
  })
  externalSources!: Array<{ ingredientId: string; externalSourceRef: string }>;
}

/** Reserved for IngredientsController validation chains. */
export class IngredientSearchQueryDto {
  @ApiProperty()
  @IsString()
  @Length(1, 32)
  barcode!: string;
}

