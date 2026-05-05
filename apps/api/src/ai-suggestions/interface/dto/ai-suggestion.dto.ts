import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  AiSuggestion,
  AiSuggestionStatus,
} from '../../domain/ai-suggestion.entity';

export class SuggestYieldDto {
  @ApiProperty()
  @IsUUID('4')
  organizationId!: string;

  @ApiProperty()
  @IsUUID('4')
  ingredientId!: string;

  @ApiProperty({
    description:
      'Stable hash of the surrounding context (e.g. recipe pattern, prior lines). Two identical contexts hit the same cache row.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  contextHash!: string;
}

export class SuggestWasteDto {
  @ApiProperty()
  @IsUUID('4')
  organizationId!: string;

  @ApiProperty()
  @IsUUID('4')
  recipeId!: string;

  @ApiProperty({ description: 'Recipe-pattern context hash for cache key.' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  contextHash!: string;
}

export class AcceptSuggestionDto {
  @ApiProperty()
  @IsUUID('4')
  organizationId!: string;

  @ApiProperty({
    required: false,
    description:
      'Tweak value when the chef accepts a different number than the suggestion. Omit to accept as-is.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  value?: number;
}

export class RejectSuggestionDto {
  @ApiProperty()
  @IsUUID('4')
  organizationId!: string;

  @ApiProperty({
    description: 'Required ≥10 chars audit reason for the rejection.',
    minLength: 10,
  })
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}

const SUGGESTION_STATUSES = ['pending', 'accepted', 'rejected'] as const;

export class AiSuggestionResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ['yield', 'waste'] })
  @IsIn(['yield', 'waste'])
  kind!: 'yield' | 'waste';

  @ApiProperty({ required: false })
  targetIngredientId?: string | null;

  @ApiProperty({ required: false })
  targetRecipeId?: string | null;

  @ApiProperty({ description: 'Suggested value in [0, 1].' })
  suggestedValue!: number;

  @ApiProperty({ description: 'Citation URL — non-empty per FR19 iron rule.' })
  citationUrl!: string;

  @ApiProperty({ description: 'Captured snippet (≤500 chars).' })
  snippet!: string;

  @ApiProperty()
  modelName!: string;

  @ApiProperty()
  modelVersion!: string;

  @ApiProperty({ enum: SUGGESTION_STATUSES })
  status!: AiSuggestionStatus;

  @ApiProperty({ required: false, description: 'Set when chef tweaks the value on accept.' })
  acceptedValue?: number | null;

  @ApiProperty({ required: false })
  rejectedReason?: string | null;

  @ApiProperty({ required: false, type: String, format: 'date-time' })
  actedAt?: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt!: string;

  static fromEntity(row: AiSuggestion): AiSuggestionResponseDto {
    const dto = new AiSuggestionResponseDto();
    dto.id = row.id;
    dto.kind = row.kind;
    dto.targetIngredientId = row.targetIngredientId;
    dto.targetRecipeId = row.targetRecipeId;
    dto.suggestedValue = Number(row.suggestedValue);
    dto.citationUrl = row.citationUrl;
    dto.snippet = row.snippet;
    dto.modelName = row.modelName;
    dto.modelVersion = row.modelVersion;
    dto.status = row.status;
    dto.acceptedValue = row.acceptedValue !== null ? Number(row.acceptedValue) : null;
    dto.rejectedReason = row.rejectedReason;
    dto.actedAt = row.actedAt ? row.actedAt.toISOString() : null;
    dto.createdAt = row.createdAt.toISOString();
    dto.expiresAt = row.expiresAt.toISOString();
    return dto;
  }
}

/**
 * Wraps the optional suggestion. `suggestion: null` with a `reason` is the
 * iron-rule no-citation path (FR19); the chef is then directed to manual
 * entry. Generic `reason: 'no_citation_available'` keeps client logic simple.
 */
export class SuggestionEnvelopeDto {
  @ApiProperty({ type: AiSuggestionResponseDto, nullable: true, required: false })
  suggestion!: AiSuggestionResponseDto | null;

  @ApiProperty({ required: false, description: 'Set when suggestion is null.' })
  reason?: 'no_citation_available' | 'provider_unavailable';
}
