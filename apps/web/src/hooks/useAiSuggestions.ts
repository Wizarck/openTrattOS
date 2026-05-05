import { useMutation } from '@tanstack/react-query';
import type { AiSuggestionShape } from '@opentrattos/ui-kit';
import { ApiError, api } from '../api/client';

export interface SuggestionEnvelope {
  suggestion: (AiSuggestionShape & { acceptedValue?: number | null }) | null;
  reason?: 'no_citation_available' | 'provider_unavailable';
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

/** Mutation: POST /ai-suggestions/yield → wrapped envelope. */
export function useYieldSuggestion() {
  return useMutation<SuggestionEnvelope, ApiError, SuggestYieldInput>({
    mutationFn: async (input) =>
      api<SuggestionEnvelope>('/ai-suggestions/yield', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
  });
}

/** Mutation: POST /ai-suggestions/waste → wrapped envelope. */
export function useWasteSuggestion() {
  return useMutation<SuggestionEnvelope, ApiError, SuggestWasteInput>({
    mutationFn: async (input) =>
      api<SuggestionEnvelope>('/ai-suggestions/waste', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
  });
}

export interface AcceptInput {
  organizationId: string;
  suggestionId: string;
  /** Tweak value as a fraction in [0, 1]. Omit to accept as-is. */
  value?: number;
}

export function useAcceptAiSuggestion() {
  return useMutation<AiSuggestionShape, ApiError, AcceptInput>({
    mutationFn: async ({ organizationId, suggestionId, value }) =>
      api<AiSuggestionShape>(`/ai-suggestions/${suggestionId}/accept`, {
        method: 'POST',
        body: JSON.stringify({ organizationId, value }),
      }),
  });
}

export interface RejectInput {
  organizationId: string;
  suggestionId: string;
  /** Audit reason ≥10 chars. */
  reason: string;
}

export function useRejectAiSuggestion() {
  return useMutation<AiSuggestionShape, ApiError, RejectInput>({
    mutationFn: async ({ organizationId, suggestionId, reason }) =>
      api<AiSuggestionShape>(`/ai-suggestions/${suggestionId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ organizationId, reason }),
      }),
  });
}
