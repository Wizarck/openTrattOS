import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Recipe } from '../../domain/recipe.entity';
import { RecipeIngredient } from '../../domain/recipe-ingredient.entity';

export class CreateRecipeLineDto {
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsUUID('4')
  ingredientId?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsUUID('4')
  subRecipeId?: string | null;

  @ApiProperty({ example: 0.25 })
  @IsNumber()
  @Min(0.0001)
  quantity!: number;

  @ApiProperty({ example: 'kg' })
  @IsString()
  @Length(1, 16)
  unitId!: string;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  yieldPercentOverride?: number | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @Length(0, 200)
  sourceOverrideRef?: string | null;
}

export class CreateRecipeDto {
  @ApiProperty()
  @IsUUID('4')
  organizationId!: string;

  @ApiProperty()
  @IsString()
  @Length(1, 200)
  name!: string;

  @ApiProperty()
  @IsString()
  description!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  notes?: string | null;

  @ApiProperty({ minimum: 0, maximum: 0.999 })
  @IsNumber()
  @Min(0)
  @Max(0.999)
  wasteFactor!: number;

  @ApiProperty({ type: [CreateRecipeLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateRecipeLineDto)
  lines!: CreateRecipeLineDto[];
}

export class UpdateRecipeDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 200) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string | null;
  @ApiPropertyOptional({ minimum: 0, maximum: 0.999 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(0.999)
  wasteFactor?: number;
  @ApiPropertyOptional({ type: [CreateRecipeLineDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateRecipeLineDto)
  lines?: CreateRecipeLineDto[];
}

export class RecipeLineResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() recipeId!: string;
  @ApiProperty({ type: String, nullable: true }) ingredientId!: string | null;
  @ApiProperty({ type: String, nullable: true }) subRecipeId!: string | null;
  @ApiProperty() quantity!: number;
  @ApiProperty() unitId!: string;
  @ApiProperty({ type: Number, nullable: true }) yieldPercentOverride!: number | null;
  @ApiProperty({ type: String, nullable: true }) sourceOverrideRef!: string | null;

  static fromEntity(line: RecipeIngredient): RecipeLineResponseDto {
    return {
      id: line.id,
      recipeId: line.recipeId,
      ingredientId: line.ingredientId,
      subRecipeId: line.subRecipeId,
      quantity: Number(line.quantity),
      unitId: line.unitId,
      yieldPercentOverride:
        line.yieldPercentOverride === null ? null : Number(line.yieldPercentOverride),
      sourceOverrideRef: line.sourceOverrideRef,
    };
  }
}

export class RecipeResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() organizationId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ type: String, nullable: true }) notes!: string | null;
  @ApiProperty() wasteFactor!: number;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ description: 'Either name or "<name> (Discontinued)" when soft-deleted.' })
  displayLabel!: string;
  @ApiProperty({ type: [RecipeLineResponseDto] }) lines!: RecipeLineResponseDto[];
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;

  static fromEntity(
    recipe: Recipe,
    lines: RecipeIngredient[],
    displayLabel: string,
  ): RecipeResponseDto {
    return {
      id: recipe.id,
      organizationId: recipe.organizationId,
      name: recipe.name,
      description: recipe.description,
      notes: recipe.notes,
      wasteFactor: Number(recipe.wasteFactor),
      isActive: recipe.isActive,
      displayLabel,
      lines: lines.map(RecipeLineResponseDto.fromEntity),
      createdAt: recipe.createdAt,
      updatedAt: recipe.updatedAt,
    };
  }
}
