## Context

EU 1169/2011 Article 21 mandates conspicuous emphasis of the 14 named allergens on food information. ADR-017 picks "icon + text always" rendering as the conformance pattern (never colour-only). PRD §FR25–28 specifies conservative aggregation (never auto-clear) + Manager+ override + cross-contamination notes. This slice is the regulatory safety floor for `#10 m2-labels-rendering`.

## Goals / Non-Goals

**Goals:**
- Recipe-level allergen aggregation (FR25): conservative — ANY allergen in ANY ingredient bubbles up; never auto-clear.
- Cross-contamination override (FR26): Manager can add a recipe-level "may contain traces of [X]" note (free-text, audit-trailed).
- Recipe-level diet-flag inference (FR27): conservative — flag is true only if ALL ingredients carry it AND no contradicting allergen.
- Manager+ override flow (FR28): override aggregated allergens or inferred dietFlags with attribution + reason.
- `AllergenBadge` UI: Article 21 emphasis (bold + high contrast, **icon + text always**).
- `DietFlagsPanel` UI: vegan / vegetarian / gluten-free / halal / kosher / keto with chef override.

**Non-Goals:**
- Label rendering: `#10`.
- Schema for ingredient `allergens` + `dietFlags`: `#1` already shipped.

## Decisions

- **Aggregation is read-time, not stored on Recipe.** **Rationale**: stored aggregation goes stale on Ingredient updates; live aggregation is O(N) where N ≤ 100. Same pattern as cost rollup (`#3`).
- **Conservative inference**: a diet flag is true at Recipe level only if (a) every Ingredient carries it AND (b) no Ingredient has a contradicting allergen. **Rationale**: false positives in regulatory metadata are dangerous; false negatives are merely conservative ("we don't claim it's vegan" vs "we wrongly claim it's vegan").
- **Cross-contamination note** stored on Recipe as `crossContaminationNote` text + `crossContaminationAllergens` text[]. **Rationale**: separate from aggregated allergens (which trace to ingredients) so audit can distinguish "X is in the recipe" from "X may have touched the recipe in production".
- **Override on `aggregatedAllergens`/`dietFlags`** stored as `aggregatedAllergensOverride` + `dietFlagsOverride` jsonb on Recipe with `appliedAt`, `appliedBy`, `reason`. **Rationale**: keep aggregation logic pure; override is a separate data point that the API merges on read.
- **AllergenBadge** is the single UI primitive used everywhere allergens render. **Rationale**: enforces Article 21 styling consistency; one place to fix if ADR-017 styling evolves.

## Risks / Trade-offs

- [Risk] Regulator audit asks "which Ingredient triggered allergen X on this Recipe at time T?". **Mitigation**: aggregation includes attribution chain; cost-history pattern reused for allergen lineage.
- [Risk] Cross-contamination note is free-text — chef writes "may contain nuts" but the system doesn't know "nuts" maps to the structured allergen list. **Mitigation**: free-text + structured `crossContaminationAllergens` array side-by-side; UI prompts for both. Validation rejects free text without structured tagging.
- [Risk] Override risk: Manager incorrectly clears a real allergen. **Mitigation**: override requires reason + audit_log entry; pre-launch external legal review per ADR-019 §Risk reviews override patterns.

## Migration Plan

Steps:
1. RecipesService extension: `getAllergensRollup(recipeId)` walks tree, aggregates, returns `{aggregated: [...], byIngredient: {ingredientId: [...]}, override?: {...}, crossContamination: [...]}`.
2. RecipesService extension: `getDietFlagsRollup(recipeId)` returns `{inferred: [...], byIngredient: {...}, override?: {...}}`.
3. Endpoints: `GET /recipes/:id/allergens`, `GET /recipes/:id/diet-flags`, `PUT /recipes/:id/allergens-override`, `PUT /recipes/:id/diet-flags-override`, `PUT /recipes/:id/cross-contamination`.
4. UI: `AllergenBadge` + `DietFlagsPanel` shipped to `packages/ui-kit/`.
5. Pre-launch external legal review of override patterns (ADR-017 §Risk).

Rollback: revert; no data loss. Override fields are nullable.

## Open Questions

(none.)
