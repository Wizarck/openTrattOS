## Context

Recipes are the spine of M2. Journey 1 (Head Chef builds a new recipe) and Journey 4 (cycle-detection edge case) are direct acceptance for this slice. Foundation: `#1 m2-data-model` provides the Recipe + RecipeIngredient schema with a CHECK constraint enforcing exactly-one-of `ingredientId | subRecipeId`. This slice ships the service + controller + the UI picker that consumes it.

## Goals / Non-Goals

**Goals:**
- Recipes CRUD: create / read / update / soft-delete with sub-recipe composition.
- Cycle detection on save: graph walk capped at depth 10 (NFR), error message names both nodes + direction.
- Soft-delete UX: deleted Recipes appear in dependent MenuItem refs with a "Discontinued" badge; not selectable as new sub-recipes.
- `RecipePicker` UI for selecting existing Recipes when composing sub-recipes.
- RBAC: Owner/Manager write; Staff read-only.
- API parity: every UI action is reachable via REST per ADR-013 Agent-Ready.

**Non-Goals:**
- Cost computation: `#3 m2-cost-rollup-and-audit`.
- AI yield/waste suggestions: `#6`.
- Allergen aggregation: `#7`.
- Label generation: `#10`.

## Decisions

- **Cycle-detection algorithm: DFS with visited-set, depth-cap 10.** **Rationale**: realistic recipes have depth 2-3 (recipe → sub-recipe → ingredient). Depth 10 is far above any legitimate kitchen need; it caps malicious / buggy inputs. DFS detects back-edges (cycles) cleanly and is O(V+E) — trivially fast for the worst-case ~100-node graph. Alternative: Tarjan SCC — overkill for this scale.
- **Cycle detection runs server-side on save**, not on UI render. **Rationale**: client cycle-check would have to walk the full graph + handle stale-data race. Server is single source of truth + transactional.
- **Error format on cycle**: `{code: "CYCLE", node1Id, node1Name, node2Id, node2Name, direction: "node1 → ... → node2 → node1"}`. **Rationale**: chef sees both names + can fix one of them. Generic "cycle detected" is hostile.
- **Soft-delete via `isActive=false`** vs separate `deleted_at`. **Rationale**: M1 already uses `isActive` consistently; M2 keeps the pattern.
- **"Discontinued" badge in MenuItem refs**: server returns `recipe.isActive=false` + a synthetic `displayLabel="(Discontinued)"` so UI doesn't have to know the rule.

## Risks / Trade-offs

- [Risk] Cycle detection adds latency to every save. **Mitigation**: depth-cap 10 + DFS = sub-millisecond for realistic graphs; benchmark before merge.
- [Risk] Soft-delete interaction with sub-recipe selection: deleted Recipe must NOT be pickable but EXISTING refs must keep showing it. **Mitigation**: `RecipePicker` filters `isActive=true`; backend allows existing FKs but rejects new ones via service-layer guard.
- [Risk] Long sub-recipe chains complicate UI rendering. **Mitigation**: depth-2 expansion in `RecipePicker` by default; "show full tree" CTA for power users.

## Migration Plan

Steps:
1. RecipesService + RecipesController land in `apps/api/src/recipes/`.
2. CycleDetector class as a stateless utility, unit-tested with 20+ graph fixtures.
3. RecipesModule wired into ApiModule; routes registered.
4. RecipePicker component shipped to `packages/ui-kit/src/recipe-picker/` with Storybook story.
5. End-to-end test: create Recipe A → create Recipe B referencing A → attempt to make A reference B → expect 422 with cycle error.

Rollback: revert this change; #1 schema remains (no rows lost). Other slices that depend on this (#3, #6, #7, #8, #11) wait for re-deploy.

## Open Questions

(none.)
