## 1. AiSuggestionProvider interface + M2 implementation

- [ ] 1.1 Define `apps/api/src/ai-suggestions/types.ts` with `AiSuggestionProvider` interface (yield + waste methods)
- [ ] 1.2 Implement `GptOssRagProvider` calling internal RAG endpoint (HTTP client + retry policy)
- [ ] 1.3 Iron-rule guard: server-side check on every response — reject if `citationUrl` empty/null
- [ ] 1.4 Snippet capture + truncation to 500 chars (with ellipsis marker)
- [ ] 1.5 Wire provider into NestJS DI under feature flag `OPENTRATTOS_AI_YIELD_SUGGESTIONS_ENABLED`

## 2. AiSuggestionsService

- [ ] 2.1 `suggestYield(orgId, ingredientId, contextHash)` — cache lookup → provider call → iron-rule check → persist suggestion
- [ ] 2.2 `suggestWaste(orgId, recipeId)` — same flow with recipe-pattern classification
- [ ] 2.3 `acceptSuggestion(orgId, userId, suggestionId, valueOverride?)` — write audit_log + apply value to RecipeIngredient/Recipe
- [ ] 2.4 `rejectSuggestion(orgId, userId, suggestionId, reason)` — write audit_log; invalidate cache for this `{ingredientId, contextHash}`

## 3. Cache layer

- [ ] 3.1 Migration: `ai_suggestion_cache` table `(orgId, ingredientId, contextHash, suggestion, citationUrl, snippet, createdAt)`
- [ ] 3.2 30d TTL on cache entries (lazy expiration on read)
- [ ] 3.3 Rejection invalidation: update `rejected=true` on the cache row when chef rejects

## 4. Endpoints

- [ ] 4.1 `POST /ai-suggestions/yield` — body `{ingredientId, contextHash}`; returns suggestion or `{suggestion: null, reason}`
- [ ] 4.2 `POST /ai-suggestions/waste` — body `{recipeId}`; returns suggestion or null
- [ ] 4.3 `POST /ai-suggestions/:id/accept` — body `{value?}` for tweak
- [ ] 4.4 `POST /ai-suggestions/:id/reject` — body `{reason}` (required)
- [ ] 4.5 RBAC: Manager+ for accept/reject/suggestion creation; Staff blocked
- [ ] 4.6 Feature-flag guard: returns 404 on all endpoints when disabled

## 5. UI components

- [ ] 5.1 `packages/ui-kit/src/yield-editor/` — yield% with AI-suggestion button; citation popover renders URL + snippet; accept/tweak/reject affordances
- [ ] 5.2 `packages/ui-kit/src/waste-factor-editor/` — recipe-level waste% with same flow
- [ ] 5.3 No-citation state: editor shows "manual entry only — citation unavailable" inline
- [ ] 5.4 Both components hidden when `OPENTRATTOS_AI_YIELD_SUGGESTIONS_ENABLED=false`
- [ ] 5.5 Storybook stories cover: with-suggestion, no-citation, accepted, tweaked, rejected
- [ ] 5.6 ARIA: button + popover patterns; reason field labelled

## 6. Tests

- [ ] 6.1 Unit: iron-rule guard rejects responses with empty/null citation
- [ ] 6.2 Unit: snippet truncation at 500 chars with ellipsis
- [ ] 6.3 E2E: provider mocked → suggestion → chef accepts → audit row + override applied
- [ ] 6.4 E2E: chef rejects without reason → 422
- [ ] 6.5 E2E: chef rejects with reason → cache invalidated; next call hits provider again
- [ ] 6.6 E2E: feature flag disabled → 404 on all endpoints; UI hides affordances
- [ ] 6.7 Performance: cache-hit returns <50ms; provider call <2s p95

## 7. Verification

- [ ] 7.1 Run `openspec validate m2-ai-yield-suggestions` — must pass
- [ ] 7.2 Manual smoke: Journey 1 with AI suggestions enabled — verify chef can accept + tweak + reject + observe audit
- [ ] 7.3 Smoke with flag disabled — verify M2 still works for manual entry
