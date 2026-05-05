import { randomUUID } from 'node:crypto';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

export type AiSuggestionKind = 'yield' | 'waste';
export type AiSuggestionStatus = 'pending' | 'accepted' | 'rejected';

export const AI_SUGGESTION_KINDS: AiSuggestionKind[] = ['yield', 'waste'];
export const AI_SUGGESTION_STATUSES: AiSuggestionStatus[] = [
  'pending',
  'accepted',
  'rejected',
];

/** Snippet character cap per FR19 — captured at suggestion time to survive URL drift. */
export const AI_SUGGESTION_SNIPPET_MAX = 500;

/** TTL for cache entries (Gate D 3 confirmed). */
export const AI_SUGGESTION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface AiSuggestionCreateProps {
  organizationId: string;
  kind: AiSuggestionKind;
  targetIngredientId: string | null;
  targetRecipeId: string | null;
  contextHash: string;
  suggestedValue: number;
  citationUrl: string;
  snippet: string;
  modelName: string;
  modelVersion: string;
}

@Entity({ name: 'ai_suggestions' })
@Index('ix_ai_suggestions_cache_lookup', [
  'organizationId',
  'kind',
  'targetIngredientId',
  'targetRecipeId',
  'contextHash',
  'status',
  'expiresAt',
])
export class AiSuggestion {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ type: 'text' })
  kind!: AiSuggestionKind;

  @Column({ name: 'target_ingredient_id', type: 'uuid', nullable: true })
  targetIngredientId: string | null = null;

  @Column({ name: 'target_recipe_id', type: 'uuid', nullable: true })
  targetRecipeId: string | null = null;

  @Column({ name: 'context_hash', type: 'text' })
  contextHash!: string;

  @Column({ name: 'suggested_value', type: 'numeric', precision: 8, scale: 4 })
  suggestedValue!: number;

  @Column({ name: 'citation_url', type: 'text' })
  citationUrl!: string;

  @Column({ type: 'text' })
  snippet!: string;

  @Column({ name: 'model_name', type: 'text' })
  modelName!: string;

  @Column({ name: 'model_version', type: 'text' })
  modelVersion!: string;

  @Column({ type: 'text', default: 'pending' })
  status: AiSuggestionStatus = 'pending';

  @Column({ name: 'accepted_value', type: 'numeric', precision: 8, scale: 4, nullable: true })
  acceptedValue: number | null = null;

  @Column({ name: 'rejected_reason', type: 'text', nullable: true })
  rejectedReason: string | null = null;

  @Column({ name: 'acted_by_user_id', type: 'uuid', nullable: true })
  actedByUserId: string | null = null;

  @Column({ name: 'acted_at', type: 'timestamptz', nullable: true })
  actedAt: Date | null = null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  static create(props: AiSuggestionCreateProps): AiSuggestion {
    AiSuggestion.validate(props);
    const row = new AiSuggestion();
    row.id = randomUUID();
    row.organizationId = props.organizationId;
    row.kind = props.kind;
    row.targetIngredientId = props.targetIngredientId;
    row.targetRecipeId = props.targetRecipeId;
    row.contextHash = props.contextHash;
    row.suggestedValue = props.suggestedValue;
    row.citationUrl = props.citationUrl;
    row.snippet = props.snippet;
    row.modelName = props.modelName;
    row.modelVersion = props.modelVersion;
    row.status = 'pending';
    const now = new Date();
    row.createdAt = now;
    row.expiresAt = new Date(now.getTime() + AI_SUGGESTION_TTL_MS);
    return row;
  }

  private static validate(props: AiSuggestionCreateProps): void {
    if (!AI_SUGGESTION_KINDS.includes(props.kind)) {
      throw new Error(`AiSuggestion.kind must be one of ${AI_SUGGESTION_KINDS.join('|')}`);
    }
    if (props.kind === 'yield' && !props.targetIngredientId) {
      throw new Error('AiSuggestion.kind=yield requires targetIngredientId');
    }
    if (props.kind === 'waste' && !props.targetRecipeId) {
      throw new Error('AiSuggestion.kind=waste requires targetRecipeId');
    }
    if (props.kind === 'yield' && props.targetRecipeId) {
      throw new Error('AiSuggestion.kind=yield must not set targetRecipeId');
    }
    if (props.kind === 'waste' && props.targetIngredientId) {
      throw new Error('AiSuggestion.kind=waste must not set targetIngredientId');
    }
    if (
      !Number.isFinite(props.suggestedValue) ||
      props.suggestedValue < 0 ||
      props.suggestedValue > 1
    ) {
      throw new Error('AiSuggestion.suggestedValue must be in [0, 1]');
    }
    if (typeof props.citationUrl !== 'string' || props.citationUrl.trim().length === 0) {
      throw new Error('AiSuggestion.citationUrl is required (FR19 iron rule)');
    }
    if (typeof props.snippet !== 'string' || props.snippet.trim().length === 0) {
      throw new Error('AiSuggestion.snippet is required (FR19 iron rule)');
    }
    if (props.snippet.length > AI_SUGGESTION_SNIPPET_MAX) {
      throw new Error(
        `AiSuggestion.snippet must be ≤ ${AI_SUGGESTION_SNIPPET_MAX} chars; got ${props.snippet.length}`,
      );
    }
    if (typeof props.modelName !== 'string' || props.modelName.trim().length === 0) {
      throw new Error('AiSuggestion.modelName is required');
    }
    if (typeof props.modelVersion !== 'string' || props.modelVersion.trim().length === 0) {
      throw new Error('AiSuggestion.modelVersion is required');
    }
    if (typeof props.contextHash !== 'string' || props.contextHash.trim().length === 0) {
      throw new Error('AiSuggestion.contextHash must be a non-empty string');
    }
  }

  isCacheable(now: Date = new Date()): boolean {
    return this.status === 'pending' && this.expiresAt > now;
  }

  /** The chef-facing effective value: acceptedValue when tweaked, suggestedValue otherwise. */
  effectiveValue(): number {
    return this.acceptedValue ?? Number(this.suggestedValue);
  }
}
