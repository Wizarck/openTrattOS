import { AI_SUGGESTION_SNIPPET_MAX } from '../domain/ai-suggestion.entity';

/**
 * Pluggable AI suggestion provider contract per ADR-013. The M2 default
 * implementation is `GptOssRagProvider` (Gate D 1a); future providers (Claude
 * Haiku / Hermes / etc.) implement this same interface and get registered at
 * the module layer.
 *
 * Iron rule (FR19): the provider MUST return either a complete suggestion
 * with both `citationUrl` AND `snippet` populated, or `null`. The
 * `AiSuggestionsService` enforces this server-side regardless of provider.
 *
 * Failure modes (network errors, 5xx, parse errors, timeouts) MUST be
 * surfaced as `null` — the controller continues to serve a "no suggestion
 * available" response. Throwing crashes the request.
 */
export interface AiSuggestionProvider {
  readonly id: string;
  /** Snake-case canonical model name persisted on the suggestion row. */
  readonly modelName: string;
  /** Pinned version string persisted alongside `modelName`. */
  readonly modelVersion: string;

  suggestYield(input: SuggestYieldInput): Promise<ProviderResult | null>;
  suggestWaste(input: SuggestWasteInput): Promise<ProviderResult | null>;
}

export interface SuggestYieldInput {
  organizationId: string;
  ingredientId: string;
  contextHash: string;
}

export interface SuggestWasteInput {
  organizationId: string;
  recipeId: string;
  contextHash: string;
}

export interface ProviderResult {
  /** Numeric value in `[0, 1]` — yield% or wasteFactor. */
  value: number;
  /** Citation URL (iron rule — non-empty string). */
  citationUrl: string;
  /** Captured snippet of cited content (≤500 chars; truncated by service if longer). */
  snippet: string;
}

/** DI token for the default provider — resolved at module configure time. */
export const AI_SUGGESTION_PROVIDER = Symbol('AI_SUGGESTION_PROVIDER');

/** DI token for the feature-flag boolean. Read by service + controller. */
export const AI_YIELD_SUGGESTIONS_ENABLED = Symbol('AI_YIELD_SUGGESTIONS_ENABLED');

/**
 * Iron-rule guard. Returns the result unchanged if both `citationUrl` and
 * `snippet` are non-empty after trim; returns `null` otherwise.
 *
 * Truncates snippet to `AI_SUGGESTION_SNIPPET_MAX` chars with an ellipsis
 * marker `…` so the persisted row never violates the entity's length check.
 */
export function applyIronRule(result: ProviderResult | null): ProviderResult | null {
  if (!result) return null;
  if (typeof result.value !== 'number' || !Number.isFinite(result.value)) return null;
  if (result.value < 0 || result.value > 1) return null;
  if (typeof result.citationUrl !== 'string' || result.citationUrl.trim().length === 0) {
    return null;
  }
  if (typeof result.snippet !== 'string' || result.snippet.trim().length === 0) {
    return null;
  }
  const snippet =
    result.snippet.length > AI_SUGGESTION_SNIPPET_MAX
      ? `${result.snippet.slice(0, AI_SUGGESTION_SNIPPET_MAX - 1)}…`
      : result.snippet;
  return {
    value: result.value,
    citationUrl: result.citationUrl.trim(),
    snippet,
  };
}
