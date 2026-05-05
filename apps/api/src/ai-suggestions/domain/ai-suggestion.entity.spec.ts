import { AI_SUGGESTION_TTL_MS, AiSuggestion } from './ai-suggestion.entity';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const I_PASTA = '22222222-2222-4222-8222-222222222222';
const RECIPE = '33333333-3333-4333-8333-333333333333';

describe('AiSuggestion.create', () => {
  function baseProps(overrides: Partial<Parameters<typeof AiSuggestion.create>[0]> = {}) {
    return {
      organizationId: ORG_ID,
      kind: 'yield' as const,
      targetIngredientId: I_PASTA,
      targetRecipeId: null,
      contextHash: 'ctx-1',
      suggestedValue: 0.85,
      citationUrl: 'https://example.com',
      snippet: 'Pelar y descartar capas externas',
      modelName: 'gpt-oss-20b-rag',
      modelVersion: '1.0',
      ...overrides,
    };
  }

  it('builds a valid yield suggestion with TTL 30 days from createdAt', () => {
    const before = Date.now();
    const row = AiSuggestion.create(baseProps());
    const after = Date.now();
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(row.kind).toBe('yield');
    expect(row.status).toBe('pending');
    expect(row.targetIngredientId).toBe(I_PASTA);
    expect(row.targetRecipeId).toBeNull();
    expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBe(AI_SUGGESTION_TTL_MS);
    expect(row.createdAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(row.createdAt.getTime()).toBeLessThanOrEqual(after);
  });

  it('builds a valid waste suggestion', () => {
    const row = AiSuggestion.create(
      baseProps({
        kind: 'waste',
        targetIngredientId: null,
        targetRecipeId: RECIPE,
      }),
    );
    expect(row.kind).toBe('waste');
    expect(row.targetRecipeId).toBe(RECIPE);
    expect(row.targetIngredientId).toBeNull();
  });

  it('rejects unknown kind', () => {
    expect(() =>
      AiSuggestion.create(baseProps({ kind: 'badkind' as never })),
    ).toThrow(/AiSuggestion.kind must be one of/);
  });

  it('requires targetIngredientId for kind=yield', () => {
    expect(() =>
      AiSuggestion.create(baseProps({ targetIngredientId: null })),
    ).toThrow(/yield requires targetIngredientId/);
  });

  it('requires targetRecipeId for kind=waste', () => {
    expect(() =>
      AiSuggestion.create(
        baseProps({
          kind: 'waste',
          targetIngredientId: null,
          targetRecipeId: null,
        }),
      ),
    ).toThrow(/waste requires targetRecipeId/);
  });

  it('rejects yield with targetRecipeId set (XOR violation)', () => {
    expect(() =>
      AiSuggestion.create(baseProps({ targetRecipeId: RECIPE })),
    ).toThrow(/yield must not set targetRecipeId/);
  });

  it('rejects waste with targetIngredientId set (XOR violation)', () => {
    expect(() =>
      AiSuggestion.create(
        baseProps({
          kind: 'waste',
          targetIngredientId: I_PASTA,
          targetRecipeId: RECIPE,
        }),
      ),
    ).toThrow(/waste must not set targetIngredientId/);
  });

  it('rejects suggestedValue below 0', () => {
    expect(() => AiSuggestion.create(baseProps({ suggestedValue: -0.1 }))).toThrow(
      /suggestedValue must be in/,
    );
  });

  it('rejects suggestedValue above 1', () => {
    expect(() => AiSuggestion.create(baseProps({ suggestedValue: 1.5 }))).toThrow(
      /suggestedValue must be in/,
    );
  });

  it('rejects empty citationUrl (FR19 iron rule)', () => {
    expect(() => AiSuggestion.create(baseProps({ citationUrl: '' }))).toThrow(
      /citationUrl is required/,
    );
  });

  it('rejects empty snippet (FR19 iron rule)', () => {
    expect(() => AiSuggestion.create(baseProps({ snippet: '   ' }))).toThrow(
      /snippet is required/,
    );
  });

  it('rejects snippet >500 chars (DB-level CHECK mirror)', () => {
    expect(() =>
      AiSuggestion.create(baseProps({ snippet: 'x'.repeat(501) })),
    ).toThrow(/snippet must be ≤ 500 chars/);
  });

  it('rejects empty modelName / modelVersion / contextHash', () => {
    expect(() => AiSuggestion.create(baseProps({ modelName: '' }))).toThrow();
    expect(() => AiSuggestion.create(baseProps({ modelVersion: '' }))).toThrow();
    expect(() => AiSuggestion.create(baseProps({ contextHash: '' }))).toThrow();
  });
});

describe('AiSuggestion helpers', () => {
  function pendingRow(): AiSuggestion {
    return AiSuggestion.create({
      organizationId: ORG_ID,
      kind: 'yield',
      targetIngredientId: I_PASTA,
      targetRecipeId: null,
      contextHash: 'ctx',
      suggestedValue: 0.5,
      citationUrl: 'https://x',
      snippet: 's',
      modelName: 'm',
      modelVersion: '1',
    });
  }

  it('isCacheable returns true for fresh pending row', () => {
    const row = pendingRow();
    expect(row.isCacheable()).toBe(true);
  });

  it('isCacheable returns false when status is rejected', () => {
    const row = pendingRow();
    row.status = 'rejected';
    expect(row.isCacheable()).toBe(false);
  });

  it('isCacheable returns false when status is accepted', () => {
    const row = pendingRow();
    row.status = 'accepted';
    expect(row.isCacheable()).toBe(false);
  });

  it('isCacheable returns false when expired', () => {
    const row = pendingRow();
    row.expiresAt = new Date(Date.now() - 1000);
    expect(row.isCacheable()).toBe(false);
  });

  it('effectiveValue returns acceptedValue when chef tweaked', () => {
    const row = pendingRow();
    row.acceptedValue = 0.75 as unknown as number;
    expect(row.effectiveValue()).toBe(0.75);
  });

  it('effectiveValue returns suggestedValue when no tweak', () => {
    const row = pendingRow();
    expect(row.effectiveValue()).toBe(0.5);
  });
});
