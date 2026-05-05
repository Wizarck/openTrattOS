import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, LessThanOrEqual, MoreThan } from 'typeorm';
import { AiSuggestion } from '../domain/ai-suggestion.entity';
import {
  AI_SUGGESTION_PROVIDER,
  AI_YIELD_SUGGESTIONS_ENABLED,
  AiSuggestionProvider,
  applyIronRule,
} from './types';
import {
  AiSuggestionAlreadyActedError,
  AiSuggestionNotFoundError,
  AiSuggestionRejectReasonError,
  AiSuggestionTweakValueError,
  AiSuggestionsDisabledError,
} from './errors';

export const MIN_REJECT_REASON_LENGTH = 10;

export interface SuggestYieldArgs {
  organizationId: string;
  ingredientId: string;
  contextHash: string;
}

export interface SuggestWasteArgs {
  organizationId: string;
  recipeId: string;
  contextHash: string;
}

export interface AcceptArgs {
  organizationId: string;
  userId: string;
  suggestionId: string;
  /** Tweak value when chef accepts a different number than the suggestion. Must be in [0, 1]. */
  valueOverride?: number;
}

export interface RejectArgs {
  organizationId: string;
  userId: string;
  suggestionId: string;
  reason: string;
}

@Injectable()
export class AiSuggestionsService {
  private readonly logger = new Logger(AiSuggestionsService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(AI_SUGGESTION_PROVIDER) private readonly provider: AiSuggestionProvider,
    @Inject(AI_YIELD_SUGGESTIONS_ENABLED) private readonly enabled: boolean,
  ) {}

  /**
   * Cache lookup → provider call → iron-rule guard → persist row.
   * Returns the persisted suggestion or `null` when iron-rule fails / provider
   * returns no result.
   */
  async suggestYield(args: SuggestYieldArgs): Promise<AiSuggestion | null> {
    this.assertEnabled();
    const cached = await this.lookupCache({
      organizationId: args.organizationId,
      kind: 'yield',
      targetIngredientId: args.ingredientId,
      targetRecipeId: null,
      contextHash: args.contextHash,
    });
    if (cached) return cached;

    const result = applyIronRule(
      await this.provider.suggestYield({
        organizationId: args.organizationId,
        ingredientId: args.ingredientId,
        contextHash: args.contextHash,
      }),
    );
    if (!result) return null;

    return this.persist({
      organizationId: args.organizationId,
      kind: 'yield',
      targetIngredientId: args.ingredientId,
      targetRecipeId: null,
      contextHash: args.contextHash,
      suggestedValue: result.value,
      citationUrl: result.citationUrl,
      snippet: result.snippet,
    });
  }

  async suggestWaste(args: SuggestWasteArgs): Promise<AiSuggestion | null> {
    this.assertEnabled();
    const cached = await this.lookupCache({
      organizationId: args.organizationId,
      kind: 'waste',
      targetIngredientId: null,
      targetRecipeId: args.recipeId,
      contextHash: args.contextHash,
    });
    if (cached) return cached;

    const result = applyIronRule(
      await this.provider.suggestWaste({
        organizationId: args.organizationId,
        recipeId: args.recipeId,
        contextHash: args.contextHash,
      }),
    );
    if (!result) return null;

    return this.persist({
      organizationId: args.organizationId,
      kind: 'waste',
      targetIngredientId: null,
      targetRecipeId: args.recipeId,
      contextHash: args.contextHash,
      suggestedValue: result.value,
      citationUrl: result.citationUrl,
      snippet: result.snippet,
    });
  }

  async acceptSuggestion(args: AcceptArgs): Promise<AiSuggestion> {
    this.assertEnabled();
    if (
      args.valueOverride !== undefined &&
      (!Number.isFinite(args.valueOverride) ||
        args.valueOverride < 0 ||
        args.valueOverride > 1)
    ) {
      throw new AiSuggestionTweakValueError();
    }
    return this.dataSource.transaction(async (em) => {
      const repo = em.getRepository(AiSuggestion);
      const row = await repo.findOneBy({
        id: args.suggestionId,
        organizationId: args.organizationId,
      });
      if (!row) throw new AiSuggestionNotFoundError(args.suggestionId);
      if (row.status !== 'pending') {
        throw new AiSuggestionAlreadyActedError(args.suggestionId, row.status);
      }
      row.status = 'accepted';
      row.acceptedValue = args.valueOverride ?? null;
      row.actedByUserId = args.userId;
      row.actedAt = new Date();
      return repo.save(row);
    });
  }

  async rejectSuggestion(args: RejectArgs): Promise<AiSuggestion> {
    this.assertEnabled();
    if (typeof args.reason !== 'string' || args.reason.trim().length < MIN_REJECT_REASON_LENGTH) {
      throw new AiSuggestionRejectReasonError(MIN_REJECT_REASON_LENGTH);
    }
    return this.dataSource.transaction(async (em) => {
      const repo = em.getRepository(AiSuggestion);
      const row = await repo.findOneBy({
        id: args.suggestionId,
        organizationId: args.organizationId,
      });
      if (!row) throw new AiSuggestionNotFoundError(args.suggestionId);
      if (row.status !== 'pending') {
        throw new AiSuggestionAlreadyActedError(args.suggestionId, row.status);
      }
      row.status = 'rejected';
      row.rejectedReason = args.reason.trim();
      row.actedByUserId = args.userId;
      row.actedAt = new Date();
      return repo.save(row);
    });
  }

  // ----------------------------- internal -----------------------------

  private assertEnabled(): void {
    if (!this.enabled) throw new AiSuggestionsDisabledError();
  }

  private async lookupCache(key: {
    organizationId: string;
    kind: 'yield' | 'waste';
    targetIngredientId: string | null;
    targetRecipeId: string | null;
    contextHash: string;
  }): Promise<AiSuggestion | null> {
    const now = new Date();
    return this.dataSource.getRepository(AiSuggestion).findOne({
      where: {
        organizationId: key.organizationId,
        kind: key.kind,
        targetIngredientId: key.targetIngredientId ?? undefined,
        targetRecipeId: key.targetRecipeId ?? undefined,
        contextHash: key.contextHash,
        status: 'pending',
        expiresAt: MoreThan(now),
      },
      order: { createdAt: 'DESC' },
    });
  }

  private async persist(props: {
    organizationId: string;
    kind: 'yield' | 'waste';
    targetIngredientId: string | null;
    targetRecipeId: string | null;
    contextHash: string;
    suggestedValue: number;
    citationUrl: string;
    snippet: string;
  }): Promise<AiSuggestion> {
    const row = AiSuggestion.create({
      organizationId: props.organizationId,
      kind: props.kind,
      targetIngredientId: props.targetIngredientId,
      targetRecipeId: props.targetRecipeId,
      contextHash: props.contextHash,
      suggestedValue: props.suggestedValue,
      citationUrl: props.citationUrl,
      snippet: props.snippet,
      modelName: this.provider.modelName,
      modelVersion: this.provider.modelVersion,
    });
    return this.dataSource.getRepository(AiSuggestion).save(row);
  }

  /** Test helper — exposes the cache lookup without re-implementing the LessThanOrEqual filter. */
  async _testFindCache(orgId: string, kind: 'yield' | 'waste'): Promise<AiSuggestion[]> {
    return this.dataSource.getRepository(AiSuggestion).find({
      where: { organizationId: orgId, kind, expiresAt: LessThanOrEqual(new Date(8.64e15)) },
      order: { createdAt: 'DESC' },
    });
  }
}
