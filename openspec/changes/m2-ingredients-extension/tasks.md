## 1. Lift `walkRecipeTree` helper (refactor — must keep 459 tests green)

- [ ] 1.1 Create `apps/api/src/recipes/application/recipe-tree-walker.ts` exporting `walkRecipeTree(em, orgId, recipeId, onLeaf, options?)` with cycle defence (depth cap 10) + `visiting: Set<string>` pattern from existing implementations
- [ ] 1.2 Refactor `cost.service.ts` to consume `walkRecipeTree`; delete the inline walker
- [ ] 1.3 Refactor `recipes-allergens.service.ts` to consume `walkRecipeTree`; delete the inline walker
- [ ] 1.4 Refactor `cycle-detector.ts` to consume `walkRecipeTree`; delete the inline DFS
- [ ] 1.5 All 459 backend tests must stay green after each refactor

## 2. IngredientsService extensions + migration

- [ ] 2.1 Migration `0014_ingredients_overrides_column.ts` — class `IngredientsOverridesColumn1700000014000` adds `overrides jsonb DEFAULT '{}'::jsonb NOT NULL`
- [ ] 2.2 `IngredientOverride` interface in `apps/api/src/ingredients/domain/`
- [ ] 2.3 `IngredientsService.searchByBarcode(orgId, barcode)` — delegates to `#4`'s `ExternalCatalogService.findByBarcode`
- [ ] 2.4 `IngredientsService.prefillFromOff(externalCatalogRow)` — pure function mapping OFF row → `CreateIngredientDto` shape
- [ ] 2.5 `IngredientsService.applyOverride(orgId, actorUserId, ingredientId, field, value, reason)` — jsonb merge; emits `INGREDIENT_OVERRIDE_CHANGED` event
- [ ] 2.6 `IngredientsService.getMacroRollup(orgId, recipeId)` — consumes `walkRecipeTree`; sums `nutrition × quantity × yield × (1 − waste)`
- [ ] 2.7 New event constant `INGREDIENT_OVERRIDE_CHANGED` in `apps/api/src/cost/application/cost.events.ts` (reserved channel; future audit listener subscribes)
- [ ] 2.8 ≥10 unit tests covering search, prefill, override merge, macro rollup, walker reuse

## 3. Endpoints

- [ ] 3.1 `GET /ingredients/search?barcode=` (all roles) — returns `[{ source: 'local' | 'off', ingredientCandidate }]`
- [ ] 3.2 Extend `POST /ingredients` accept `externalSourceRef` + OFF-pulled fields
- [ ] 3.3 Extend `PUT /ingredients/:id` accept `overrides` payload (Manager+ only; ≥10-char reason; 422 on missing reason; 403 on Staff)
- [ ] 3.4 `GET /recipes/:id/macros` (all roles) — returns `{ perPortion, per100g, externalSources: [{ ingredientId, externalSourceRef }] }`
- [ ] 3.5 OpenAPI / Swagger annotations on all 3 new + 2 extended endpoints

## 4. UI: MacroPanel (per-component file layout)

- [ ] 4.1 `packages/ui-kit/src/components/MacroPanel/MacroPanel.types.ts` — hand-mirrored `MacroRollup { perPortion, per100g, externalSources }` + `MacroPanelProps { rollup, mode?: 'compact'|'expanded', locale? }`
- [ ] 4.2 `MacroPanel.tsx` — compact (portion only) + expanded (both) views; ODbL attribution line ALWAYS visible when `externalSources` non-empty (per Gate D decision 3)
- [ ] 4.3 `MacroPanel.stories.tsx` — Default / Compact / Expanded / NoOFFSources / WithOFFSources / Loading / Empty
- [ ] 4.4 `MacroPanel.test.tsx` — ≥10 tests: render perPortion, render per100g (expanded only), ODbL attribution visibility, Intl.NumberFormat, ARIA semantic table, mode prop, loading / empty
- [ ] 4.5 `index.ts` re-exports
- [ ] 4.6 Update `packages/ui-kit/src/index.ts` barrel

## 5. apps/web stub screen (J1 macros segment)

- [ ] 5.1 `apps/web/src/hooks/useRecipeMacros.ts` — TanStack Query for `GET /recipes/:id/macros`
- [ ] 5.2 Extend `RecipeBuilderJ1Screen.tsx` to mount `<MacroPanel>` when a recipe is selected (additive; existing components stay)

## 6. Verification

- [ ] 6.1 Run `openspec validate m2-ingredients-extension` — must pass
- [ ] 6.2 `npm test --workspace=apps/api` — 459 backend tests still green; ≥10 new tests pass
- [ ] 6.3 `npm test --workspace=packages/ui-kit` — ≥111 total (101 + ≥10 MacroPanel) green
- [ ] 6.4 `npm run build --workspace=apps/web` — bundle <300 KB gzipped
- [ ] 6.5 `npm run build-storybook --workspace=packages/ui-kit` — 9 components total in static output
- [ ] 6.6 Lint clean both workspaces
- [ ] 6.7 Manual smoke: barcode search hits OFF mirror; override applies with reason; macro rollup matches walked tree

## 7. CI + landing

- [ ] 7.1 PR opens proposal-only at Gate D for Master review
- [ ] 7.2 Implementation pushed AFTER Gate D approval
- [ ] 7.3 All 8 CI checks green; admin-merge once required checks pass
- [ ] 7.4 Archive `openspec/changes/m2-ingredients-extension/` → `openspec/specs/m2-ingredients-extension/`
- [ ] 7.5 Write `retros/m2-ingredients-extension.md`
- [ ] 7.6 Update auto-memory `project_m1_state.md`
