import { DataSource } from 'typeorm';
import { AiSuggestion } from '../domain/ai-suggestion.entity';
import {
  AiSuggestionAlreadyActedError,
  AiSuggestionNotFoundError,
  AiSuggestionRejectReasonError,
  AiSuggestionTweakValueError,
  AiSuggestionsDisabledError,
} from './errors';
import { AiSuggestionsService } from './ai-suggestions.service';
import { AiSuggestionProvider, ProviderResult } from './types';

const ORG = '11111111-1111-4111-8111-111111111111';
const ING = '22222222-2222-4222-8222-222222222222';
const REC = '33333333-3333-4333-8333-333333333333';
const USER = '44444444-4444-4444-8444-444444444444';

function makeProviderStub(behaviour: 'valid' | 'no-citation' | 'null'): {
  provider: AiSuggestionProvider;
  yieldCalls: unknown[];
  wasteCalls: unknown[];
} {
  const yieldCalls: unknown[] = [];
  const wasteCalls: unknown[] = [];
  const result: ProviderResult | null =
    behaviour === 'valid'
      ? { value: 0.85, citationUrl: 'https://example.com', snippet: 'snippet text' }
      : behaviour === 'no-citation'
        ? { value: 0.85, citationUrl: '', snippet: 'snippet text' }
        : null;
  const provider: AiSuggestionProvider = {
    id: 'stub',
    modelName: 'stub-model',
    modelVersion: '0.1',
    async suggestYield(input) {
      yieldCalls.push(input);
      return result;
    },
    async suggestWaste(input) {
      wasteCalls.push(input);
      return result;
    },
  };
  return { provider, yieldCalls, wasteCalls };
}

interface FakeRepoState {
  rows: AiSuggestion[];
  saveCalls: AiSuggestion[];
}

function makeFakeDataSource(state: FakeRepoState): DataSource {
  const repo = {
    findOne: async (opts: { where: Record<string, unknown> }) => {
      const where = opts.where as Record<string, unknown> & {
        organizationId?: string;
        kind?: string;
        targetIngredientId?: string;
        targetRecipeId?: string;
        contextHash?: string;
        status?: string;
        expiresAt?: { _value?: Date; _type?: string };
      };
      const now = new Date();
      const candidate = state.rows.find((r) => {
        if (where.organizationId && r.organizationId !== where.organizationId) return false;
        if (where.kind && r.kind !== where.kind) return false;
        if ('targetIngredientId' in where && where.targetIngredientId !== undefined) {
          if (r.targetIngredientId !== where.targetIngredientId) return false;
        }
        if ('targetRecipeId' in where && where.targetRecipeId !== undefined) {
          if (r.targetRecipeId !== where.targetRecipeId) return false;
        }
        if (where.contextHash && r.contextHash !== where.contextHash) return false;
        if (where.status && r.status !== where.status) return false;
        // MoreThan(now) for expiresAt:
        if (where.expiresAt && r.expiresAt <= now) return false;
        return true;
      });
      return candidate ?? null;
    },
    findOneBy: async (where: { id?: string; organizationId?: string }) => {
      return (
        state.rows.find(
          (r) =>
            (!where.id || r.id === where.id) &&
            (!where.organizationId || r.organizationId === where.organizationId),
        ) ?? null
      );
    },
    save: async (row: AiSuggestion) => {
      state.saveCalls.push(row);
      const existing = state.rows.findIndex((r) => r.id === row.id);
      if (existing >= 0) state.rows[existing] = row;
      else state.rows.push(row);
      return row;
    },
  };
  const ds = {
    getRepository: () => repo,
    transaction: async (cb: unknown) => {
      const wrapper = { getRepository: () => repo };
      return (cb as (em: typeof wrapper) => Promise<unknown>)(wrapper);
    },
  };
  return ds as unknown as DataSource;
}

describe('AiSuggestionsService', () => {
  function build(opts: {
    enabled?: boolean;
    providerBehaviour?: 'valid' | 'no-citation' | 'null';
    seedRows?: AiSuggestion[];
  } = {}) {
    const state: FakeRepoState = { rows: opts.seedRows ?? [], saveCalls: [] };
    const dataSource = makeFakeDataSource(state);
    const stub = makeProviderStub(opts.providerBehaviour ?? 'valid');
    const service = new AiSuggestionsService(dataSource, stub.provider, opts.enabled ?? true);
    return { service, state, stub };
  }

  // --------- suggestYield ----------------

  describe('suggestYield', () => {
    it('returns persisted suggestion on happy path', async () => {
      const { service, state } = build();
      const row = await service.suggestYield({
        organizationId: ORG,
        ingredientId: ING,
        contextHash: 'ctx-1',
      });
      expect(row).not.toBeNull();
      expect(row!.kind).toBe('yield');
      expect(row!.targetIngredientId).toBe(ING);
      expect(row!.suggestedValue).toBe(0.85);
      expect(row!.modelName).toBe('stub-model');
      expect(state.saveCalls).toHaveLength(1);
    });

    it('returns null when iron-rule rejects (no citation)', async () => {
      const { service, state } = build({ providerBehaviour: 'no-citation' });
      const row = await service.suggestYield({
        organizationId: ORG,
        ingredientId: ING,
        contextHash: 'ctx-1',
      });
      expect(row).toBeNull();
      expect(state.saveCalls).toHaveLength(0);
    });

    it('returns null when provider returns null (no result)', async () => {
      const { service, state } = build({ providerBehaviour: 'null' });
      const row = await service.suggestYield({
        organizationId: ORG,
        ingredientId: ING,
        contextHash: 'ctx-1',
      });
      expect(row).toBeNull();
      expect(state.saveCalls).toHaveLength(0);
    });

    it('returns cached row without calling provider on cache hit', async () => {
      const cached = AiSuggestion.create({
        organizationId: ORG,
        kind: 'yield',
        targetIngredientId: ING,
        targetRecipeId: null,
        contextHash: 'ctx-1',
        suggestedValue: 0.5,
        citationUrl: 'https://cached',
        snippet: 'cached snippet',
        modelName: 'stub-model',
        modelVersion: '0.1',
      });
      const { service, state, stub } = build({ seedRows: [cached] });
      const row = await service.suggestYield({
        organizationId: ORG,
        ingredientId: ING,
        contextHash: 'ctx-1',
      });
      expect(row?.id).toBe(cached.id);
      expect(state.saveCalls).toHaveLength(0);
      expect(stub.yieldCalls).toHaveLength(0);
    });

    it('skips rejected cached row (not returned from cache)', async () => {
      const rejected = AiSuggestion.create({
        organizationId: ORG,
        kind: 'yield',
        targetIngredientId: ING,
        targetRecipeId: null,
        contextHash: 'ctx-1',
        suggestedValue: 0.5,
        citationUrl: 'https://cached',
        snippet: 'cached',
        modelName: 'stub-model',
        modelVersion: '0.1',
      });
      rejected.status = 'rejected';
      const { service, state, stub } = build({ seedRows: [rejected] });
      const row = await service.suggestYield({
        organizationId: ORG,
        ingredientId: ING,
        contextHash: 'ctx-1',
      });
      expect(row).not.toBeNull();
      expect(row!.id).not.toBe(rejected.id);
      expect(state.saveCalls).toHaveLength(1);
      expect(stub.yieldCalls).toHaveLength(1);
    });

    it('skips expired cached row', async () => {
      const expired = AiSuggestion.create({
        organizationId: ORG,
        kind: 'yield',
        targetIngredientId: ING,
        targetRecipeId: null,
        contextHash: 'ctx-1',
        suggestedValue: 0.5,
        citationUrl: 'https://cached',
        snippet: 'cached',
        modelName: 'stub-model',
        modelVersion: '0.1',
      });
      expired.expiresAt = new Date(Date.now() - 60_000);
      const { service, state, stub } = build({ seedRows: [expired] });
      const row = await service.suggestYield({
        organizationId: ORG,
        ingredientId: ING,
        contextHash: 'ctx-1',
      });
      expect(row).not.toBeNull();
      expect(row!.id).not.toBe(expired.id);
      expect(stub.yieldCalls).toHaveLength(1);
    });
  });

  // --------- suggestWaste ----------------

  it('suggestWaste persists with kind=waste + targetRecipeId', async () => {
    const { service, state } = build();
    const row = await service.suggestWaste({
      organizationId: ORG,
      recipeId: REC,
      contextHash: 'ctx-w',
    });
    expect(row?.kind).toBe('waste');
    expect(row?.targetRecipeId).toBe(REC);
    expect(row?.targetIngredientId).toBeNull();
    expect(state.saveCalls).toHaveLength(1);
  });

  // --------- accept ----------------

  describe('acceptSuggestion', () => {
    function seed(): AiSuggestion {
      return AiSuggestion.create({
        organizationId: ORG,
        kind: 'yield',
        targetIngredientId: ING,
        targetRecipeId: null,
        contextHash: 'ctx',
        suggestedValue: 0.8,
        citationUrl: 'https://x',
        snippet: 's',
        modelName: 'm',
        modelVersion: '1',
      });
    }

    it('persists status=accepted + actor + timestamp without tweak', async () => {
      const row = seed();
      const { service, state } = build({ seedRows: [row] });
      const updated = await service.acceptSuggestion({
        organizationId: ORG,
        userId: USER,
        suggestionId: row.id,
      });
      expect(updated.status).toBe('accepted');
      expect(updated.acceptedValue).toBeNull();
      expect(updated.actedByUserId).toBe(USER);
      expect(updated.actedAt).toBeInstanceOf(Date);
      expect(state.saveCalls).toHaveLength(1);
    });

    it('persists tweak value when chef supplies override', async () => {
      const row = seed();
      const { service } = build({ seedRows: [row] });
      const updated = await service.acceptSuggestion({
        organizationId: ORG,
        userId: USER,
        suggestionId: row.id,
        valueOverride: 0.7,
      });
      expect(updated.acceptedValue).toBe(0.7);
    });

    it('rejects tweak value out of [0, 1]', async () => {
      const row = seed();
      const { service } = build({ seedRows: [row] });
      await expect(
        service.acceptSuggestion({
          organizationId: ORG,
          userId: USER,
          suggestionId: row.id,
          valueOverride: 1.5,
        }),
      ).rejects.toBeInstanceOf(AiSuggestionTweakValueError);
    });

    it('throws AiSuggestionNotFoundError when row missing', async () => {
      const { service } = build();
      await expect(
        service.acceptSuggestion({
          organizationId: ORG,
          userId: USER,
          suggestionId: '00000000-0000-4000-8000-000000000000',
        }),
      ).rejects.toBeInstanceOf(AiSuggestionNotFoundError);
    });

    it('throws AiSuggestionAlreadyActedError when already accepted', async () => {
      const row = seed();
      row.status = 'accepted';
      const { service } = build({ seedRows: [row] });
      await expect(
        service.acceptSuggestion({
          organizationId: ORG,
          userId: USER,
          suggestionId: row.id,
        }),
      ).rejects.toBeInstanceOf(AiSuggestionAlreadyActedError);
    });
  });

  // --------- reject ----------------

  describe('rejectSuggestion', () => {
    function seed(): AiSuggestion {
      return AiSuggestion.create({
        organizationId: ORG,
        kind: 'yield',
        targetIngredientId: ING,
        targetRecipeId: null,
        contextHash: 'ctx',
        suggestedValue: 0.8,
        citationUrl: 'https://x',
        snippet: 's',
        modelName: 'm',
        modelVersion: '1',
      });
    }

    it('persists status=rejected + reason + actor', async () => {
      const row = seed();
      const { service } = build({ seedRows: [row] });
      const updated = await service.rejectSuggestion({
        organizationId: ORG,
        userId: USER,
        suggestionId: row.id,
        reason: 'datos contradictorios con receta familiar',
      });
      expect(updated.status).toBe('rejected');
      expect(updated.rejectedReason).toBe('datos contradictorios con receta familiar');
      expect(updated.actedByUserId).toBe(USER);
    });

    it('throws AiSuggestionRejectReasonError on reason <10 chars', async () => {
      const row = seed();
      const { service } = build({ seedRows: [row] });
      await expect(
        service.rejectSuggestion({
          organizationId: ORG,
          userId: USER,
          suggestionId: row.id,
          reason: 'short',
        }),
      ).rejects.toBeInstanceOf(AiSuggestionRejectReasonError);
    });

    it('throws AiSuggestionAlreadyActedError when already rejected', async () => {
      const row = seed();
      row.status = 'rejected';
      const { service } = build({ seedRows: [row] });
      await expect(
        service.rejectSuggestion({
          organizationId: ORG,
          userId: USER,
          suggestionId: row.id,
          reason: 'this is a long enough reason',
        }),
      ).rejects.toBeInstanceOf(AiSuggestionAlreadyActedError);
    });
  });

  // --------- feature flag --------

  describe('feature flag (defence in depth)', () => {
    it('throws AiSuggestionsDisabledError on suggestYield when disabled', async () => {
      const { service } = build({ enabled: false });
      await expect(
        service.suggestYield({ organizationId: ORG, ingredientId: ING, contextHash: 'ctx' }),
      ).rejects.toBeInstanceOf(AiSuggestionsDisabledError);
    });

    it('throws AiSuggestionsDisabledError on suggestWaste when disabled', async () => {
      const { service } = build({ enabled: false });
      await expect(
        service.suggestWaste({ organizationId: ORG, recipeId: REC, contextHash: 'ctx' }),
      ).rejects.toBeInstanceOf(AiSuggestionsDisabledError);
    });

    it('throws on accept/reject when disabled', async () => {
      const { service } = build({ enabled: false });
      await expect(
        service.acceptSuggestion({
          organizationId: ORG,
          userId: USER,
          suggestionId: '00000000-0000-4000-8000-000000000000',
        }),
      ).rejects.toBeInstanceOf(AiSuggestionsDisabledError);
      await expect(
        service.rejectSuggestion({
          organizationId: ORG,
          userId: USER,
          suggestionId: '00000000-0000-4000-8000-000000000000',
          reason: 'something something something',
        }),
      ).rejects.toBeInstanceOf(AiSuggestionsDisabledError);
    });
  });
});
