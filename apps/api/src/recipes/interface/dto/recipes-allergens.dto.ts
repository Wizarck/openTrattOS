import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsString, MinLength } from 'class-validator';
import { AllergensOverride, DietFlagsOverride } from '../../domain/recipe.entity';
import { AllergensRollup, DietFlagsRollup } from '../../application/recipes-allergens.service';

// ----------------------------- request DTOs -----------------------------

export class ApplyAllergensOverrideDto {
  @ApiProperty({ type: [String], description: 'Allergens to add to the aggregated set.' })
  @IsArray()
  @IsString({ each: true })
  add!: string[];

  @ApiProperty({ type: [String], description: 'Allergens to remove from the aggregated set.' })
  @IsArray()
  @IsString({ each: true })
  remove!: string[];

  @ApiProperty({
    description: 'Audit reason for the override (required, non-empty).',
    example: 'Sesame oil added in finishing step not captured at ingredient level',
  })
  @IsString()
  @MinLength(1)
  reason!: string;
}

export class ApplyDietFlagsOverrideDto {
  @ApiProperty({
    type: [String],
    description: 'Diet-flag set the Manager declares true for the Recipe.',
  })
  @IsArray()
  @IsString({ each: true })
  flags!: string[];

  @ApiProperty({
    description: 'Audit reason for the override (required, non-empty).',
    example: 'Sub-recipe sourced from certified vegan supplier; ingredient row metadata stale',
  })
  @IsString()
  @MinLength(1)
  reason!: string;
}

export class ApplyCrossContaminationDto {
  @ApiProperty({
    description: 'Free-text production-line note (e.g. "Made on shared line with peanuts").',
  })
  @IsString()
  @MinLength(1)
  note!: string;

  @ApiProperty({
    type: [String],
    description: 'Structured allergen tags backing the free-text note (must be non-empty).',
  })
  @IsArray()
  @IsString({ each: true })
  allergens!: string[];
}

// ----------------------------- response DTOs -----------------------------

export class AllergensOverrideResponseDto {
  @ApiProperty({ type: [String] }) add!: string[];
  @ApiProperty({ type: [String] }) remove!: string[];
  @ApiProperty() reason!: string;
  @ApiProperty() appliedBy!: string;
  @ApiProperty() appliedAt!: string;

  static from(o: AllergensOverride): AllergensOverrideResponseDto {
    const dto = new AllergensOverrideResponseDto();
    dto.add = [...o.add];
    dto.remove = [...o.remove];
    dto.reason = o.reason;
    dto.appliedBy = o.appliedBy;
    dto.appliedAt = o.appliedAt;
    return dto;
  }
}

export class DietFlagsOverrideResponseDto {
  @ApiProperty({ type: [String] }) flags!: string[];
  @ApiProperty() reason!: string;
  @ApiProperty() appliedBy!: string;
  @ApiProperty() appliedAt!: string;

  static from(o: DietFlagsOverride): DietFlagsOverrideResponseDto {
    const dto = new DietFlagsOverrideResponseDto();
    dto.flags = [...o.flags];
    dto.reason = o.reason;
    dto.appliedBy = o.appliedBy;
    dto.appliedAt = o.appliedAt;
    return dto;
  }
}

export class CrossContaminationResponseDto {
  @ApiProperty({ nullable: true, type: String }) note!: string | null;
  @ApiProperty({ type: [String] }) allergens!: string[];
}

export class AllergensRollupResponseDto {
  @ApiProperty({ type: [String] }) aggregated!: string[];
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'array', items: { type: 'string' } },
    description: 'Per-leaf-ingredient attribution: ingredientId → allergens.',
  })
  byIngredient!: Record<string, string[]>;
  @ApiPropertyOptional({ type: AllergensOverrideResponseDto, nullable: true })
  override!: AllergensOverrideResponseDto | null;
  @ApiProperty({ type: CrossContaminationResponseDto })
  crossContamination!: CrossContaminationResponseDto;

  static from(rollup: AllergensRollup): AllergensRollupResponseDto {
    const dto = new AllergensRollupResponseDto();
    dto.aggregated = [...rollup.aggregated];
    dto.byIngredient = Object.fromEntries(
      Object.entries(rollup.byIngredient).map(([k, v]) => [k, [...v]]),
    );
    dto.override = rollup.override ? AllergensOverrideResponseDto.from(rollup.override) : null;
    dto.crossContamination = {
      note: rollup.crossContamination.note,
      allergens: [...rollup.crossContamination.allergens],
    };
    return dto;
  }
}

export class DietFlagsRollupResponseDto {
  @ApiProperty({ type: [String] }) inferred!: string[];
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'array', items: { type: 'string' } },
    description: 'Per-leaf-ingredient attribution: ingredientId → diet flags.',
  })
  byIngredient!: Record<string, string[]>;
  @ApiPropertyOptional({ type: DietFlagsOverrideResponseDto, nullable: true })
  override!: DietFlagsOverrideResponseDto | null;
  @ApiProperty({ type: [String] }) warnings!: string[];

  static from(rollup: DietFlagsRollup): DietFlagsRollupResponseDto {
    const dto = new DietFlagsRollupResponseDto();
    dto.inferred = [...rollup.inferred];
    dto.byIngredient = Object.fromEntries(
      Object.entries(rollup.byIngredient).map(([k, v]) => [k, [...v]]),
    );
    dto.override = rollup.override ? DietFlagsOverrideResponseDto.from(rollup.override) : null;
    dto.warnings = [...rollup.warnings];
    return dto;
  }
}
