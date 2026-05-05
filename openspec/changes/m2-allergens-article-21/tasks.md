## 1. RecipesService — allergens + diet flags rollup

- [x] 1.1 `getAllergensRollup(orgId, recipeId)` walks tree, aggregates conservatively, returns `{aggregated, byIngredient, override?, crossContamination}`
- [x] 1.2 `getDietFlagsRollup(orgId, recipeId)` walks tree, applies all-ingredients-must-carry rule, returns `{inferred, byIngredient, override?, warnings}`
- [x] 1.3 Conflict detection: warn when `vegan=true` but allergen list contains animal-derived items
- [x] 1.4 Override merge logic: apply Manager override on top of aggregated/inferred values; preserve attribution

## 2. Override + cross-contamination services

- [x] 2.1 `applyAllergensOverride(orgId, userId, recipeId, {add, remove, reason})` — persist to `aggregatedAllergensOverride` jsonb; write audit_log
- [x] 2.2 `applyDietFlagsOverride(orgId, userId, recipeId, {flags, reason})` — persist to `dietFlagsOverride`; write audit_log
- [x] 2.3 `applyCrossContamination(orgId, userId, recipeId, {note, allergens})` — persist to `crossContaminationNote` + `crossContaminationAllergens`; write audit_log
- [x] 2.4 RBAC: Manager+ for all override endpoints; Staff blocked
- [x] 2.5 Validation: reject reason missing; reject cross-contamination free-text without structured tags

## 3. Endpoints

- [x] 3.1 `GET /recipes/:id/allergens` — public read; returns aggregated + cross-contamination + override
- [x] 3.2 `GET /recipes/:id/diet-flags` — public read; returns inferred + warnings + override
- [x] 3.3 `PUT /recipes/:id/allergens-override` — Manager+ only; body `{add, remove, reason}`
- [x] 3.4 `PUT /recipes/:id/diet-flags-override` — Manager+ only; body `{flags, reason}`
- [x] 3.5 `PUT /recipes/:id/cross-contamination` — Manager+ only; body `{note, allergens}`

## 4. UI components

- [ ] 4.1 `packages/ui-kit/src/allergen-badge/` — Article 21 emphasis; icon + text always; high-contrast badge (DEFERRED to UX track)
- [ ] 4.2 `packages/ui-kit/src/diet-flags-panel/` — vegan/vegetarian/gluten-free/halal/kosher/keto with chef override + warnings (DEFERRED to UX track)
- [ ] 4.3 Cross-contamination variant: distinct outline + "may contain" prefix on AllergenBadge (DEFERRED to UX track)
- [ ] 4.4 Storybook stories: empty / single-allergen / multi-allergen / cross-contamination / override-applied / warnings (DEFERRED to UX track)
- [ ] 4.5 ARIA + screen-reader: every allergen has accessible name; warnings announced via aria-live (DEFERRED to UX track)
- [ ] 4.6 Tests cover deuteranopia simulation (icons + text verifiably independent of colour) (DEFERRED to UX track)

## 5. Tests

- [x] 5.1 Unit: aggregation conservative — never auto-clears
- [x] 5.2 Unit: sub-recipe allergens propagate with attribution chain
- [x] 5.3 Unit: diet-flag inference rejects on missing flag in any ingredient
- [x] 5.4 Unit: diet-flag inference rejects on contradicting allergen + emits warning
- [x] 5.5 E2E: Manager override accepted with reason; rejected without reason
- [x] 5.6 E2E: Cross-contamination free-text without tags rejected
- [x] 5.7 E2E: Staff blocked from all override endpoints
- [ ] 5.8 UI: AllergenBadge accessibility — icon + text + screen-reader label (DEFERRED to UX track)

## 6. Verification

- [x] 6.1 Run `openspec validate m2-allergens-article-21` — must pass
- [ ] 6.2 Pre-launch external legal review of override patterns per ADR-017 §Risk
- [ ] 6.3 Manual smoke: Recipe with mixed sources renders correct aggregated allergens + diet flags
