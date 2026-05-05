## 1. RecipePicker

- [ ] 1.1 `packages/ui-kit/src/components/RecipePicker/RecipePicker.types.ts` — hand-mirrored `RecipeListItem { id, name, displayLabel, isActive }` + `RecipePickerProps`
- [ ] 1.2 `RecipePicker.tsx` — typeahead `<input>` + dropdown list; ARIA combobox role; debounce 250 ms; keyboard nav (Up/Down/Enter/Escape)
- [ ] 1.3 `RecipePicker.stories.tsx` — Default / Loading / Empty / WithResults / KeyboardFocus / DisabledOption
- [ ] 1.4 `RecipePicker.test.tsx` — ≥10 tests: render, search input, debounce timing, keyboard nav, onSelect callback, empty state, loading state, ARIA combobox attrs, ARIA listbox attrs, controlled value
- [ ] 1.5 `index.ts` — re-exports `{ RecipePicker, type RecipePickerProps }`

## 2. IngredientPicker

- [ ] 2.1 `IngredientPicker.types.ts` — `IngredientListItem { id, name, brandName?, barcode?, displayLabel }` + `IngredientPickerProps`
- [ ] 2.2 `IngredientPicker.tsx` — typeahead like RecipePicker but renders 3-line cards (name / brand / barcode) when extended fields present; falls back to single-line when null
- [ ] 2.3 `IngredientPicker.stories.tsx` — Default / Loading / Empty / WithResultsLocalOnly / WithResultsOFFEnriched
- [ ] 2.4 `IngredientPicker.test.tsx` — ≥10 tests: render, fallback layout when brand/barcode null, search-by-brand, search-by-barcode, debounce, keyboard nav, onSelect callback, empty state, loading state, ARIA combobox role
- [ ] 2.5 `index.ts`

## 3. SourceOverridePicker

- [ ] 3.1 `SourceOverridePicker.types.ts` — `SupplierItemOption { id, supplierName, price, isPreferred, currency }` + `SourceOverridePickerProps { options, currentOverrideId?, onApply, onClear }`
- [ ] 3.2 `SourceOverridePicker.tsx` — radio-list with preferred-first ordering (visible "Preferred" badge); price ascending tiebreaker; "Use preferred" + "Clear override" actions
- [ ] 3.3 `SourceOverridePicker.stories.tsx` — Default / SingleOption / MultipleNoPreferred / MultipleWithPreferred / NoOptions / WithCurrentOverride
- [ ] 3.4 `SourceOverridePicker.test.tsx` — ≥10 tests: preferred renders first, price ordering tiebreaker, radio selection updates state, onApply fires with selected id, onClear fires when "Use preferred" clicked, empty list renders empty-state copy, currency formatting (Intl.NumberFormat), ARIA radiogroup attrs, keyboard arrow-key nav, disabled when single option
- [ ] 3.5 `index.ts`

## 4. CostDeltaTable

- [ ] 4.1 `CostDeltaTable.types.ts` — `CostDeltaRow { componentName, oldCost, newCost, deltaAbsolute, deltaPercent, direction: 'increase'|'decrease'|'unchanged' }` + `CostDeltaTableProps`
- [ ] 4.2 `CostDeltaTable.tsx` — table with 5 columns (component / old / new / Δ% / Δ€); colour token per direction (`--color-status-at-risk` / `--color-status-on-target` / `--color-fg-muted`); arrow icon (`↑` / `↓` / `—`) per row; Intl.NumberFormat for currency
- [ ] 4.3 `CostDeltaTable.stories.tsx` — Default / OnlyIncreases / OnlyDecreases / Mixed / NoChanges / Loading / Empty
- [ ] 4.4 `CostDeltaTable.test.tsx` — ≥10 tests: row rendering, colour token applied per direction, arrow icon presence + a11y, currency formatting, percent formatting, empty state, loading state, sort-by-delta-magnitude default, ARIA table attrs, keyboard table navigation
- [ ] 4.5 `index.ts`

## 5. DietFlagsPanel

- [ ] 5.1 `DietFlagsPanel.types.ts` — `DietFlag = 'vegan'|'vegetarian'|'gluten-free'|'halal'|'kosher'|'keto'`; `DietFlagsState { asserted: DietFlag[], override?: { value: DietFlag[], reason, appliedBy, appliedAt }, warnings? }` + `DietFlagsPanelProps { state, canOverride, onApplyOverride }`
- [ ] 5.2 `DietFlagsPanel.tsx` — visible flags row + "Override" button (hidden when `canOverride === false`); modal with reason textarea (≥10 chars validation) + flag checkboxes; current override metadata visible (appliedBy + appliedAt)
- [ ] 5.3 `DietFlagsPanel.stories.tsx` — Default / WithOverride / OverrideModalOpen / ValidationError / WarningsVisible / StaffViewNoOverride
- [ ] 5.4 `DietFlagsPanel.test.tsx` — ≥10 tests: flags render, override button hidden when canOverride false, modal opens, reason validation (<10 chars rejected), flag checkbox toggle updates state, onApplyOverride fires with payload, optimistic update visible, rollback on rejection, current override metadata renders, modal closes on success, ARIA dialog attrs
- [ ] 5.5 `index.ts`

## 6. ui-kit barrel + types re-export

- [ ] 6.1 `packages/ui-kit/src/index.ts` — re-export the 5 new components + their type exports
- [ ] 6.2 Verify `import { RecipePicker, IngredientPicker, ... } from '@opentrattos/ui-kit'` works in `apps/web/`

## 7. Journey-screen stubs (apps/web)

- [ ] 7.1 `apps/web/src/hooks/useRecipes.ts` — TanStack Query `GET /recipes?organizationId=<orgId>&search=<q>`
- [ ] 7.2 `apps/web/src/hooks/useIngredients.ts` — `GET /ingredients?organizationId=<orgId>&search=<q>`
- [ ] 7.3 `apps/web/src/hooks/useSupplierItems.ts` — `GET /supplier-items?ingredientId=<id>` ordered preferred→price
- [ ] 7.4 `apps/web/src/hooks/useRecipeCostHistory.ts` — `GET /recipes/:id/cost-history`
- [ ] 7.5 `apps/web/src/hooks/useRecipeCostDelta.ts` — `GET /recipes/:id/cost-delta?from=<date>`
- [ ] 7.6 `apps/web/src/hooks/useDietFlags.ts` — `GET /recipes/:id/diet-flags` + `PUT` mutation with optimistic update
- [ ] 7.7 `apps/web/src/screens/RecipeBuilderJ1Screen.tsx` — mounts RecipePicker + IngredientPicker + SourceOverridePicker + DietFlagsPanel; `?recipeId` + `?organizationId` query params
- [ ] 7.8 `apps/web/src/screens/CostInvestigationJ2Screen.tsx` — mounts CostDeltaTable; `?recipeId` + `?from` query params
- [ ] 7.9 `apps/web/src/main.tsx` — add 2 routes: `/poc/recipe-builder-j1` and `/poc/cost-investigation-j2`

## 8. Verification

- [ ] 8.1 `openspec validate m2-ui-backfill-wave1` — must pass
- [ ] 8.2 `npm test --workspace=packages/ui-kit` — ≥50 new tests, all green; 21 pre-existing tests still green
- [ ] 8.3 `npm test --workspace=apps/web` — passes (no tests yet beyond `--passWithNoTests`)
- [ ] 8.4 `npm run build --workspace=apps/web` — production bundle <300 KB gzipped
- [ ] 8.5 `npm run build-storybook --workspace=packages/ui-kit` — succeeds; 7 components total in static output
- [ ] 8.6 Manual smoke: open `/poc/recipe-builder-j1?organizationId=<id>&recipeId=<id>` against running `apps/api/`; verify all 4 components fetch + render
- [ ] 8.7 Manual smoke: open `/poc/cost-investigation-j2?recipeId=<id>&from=<date>` against running `apps/api/`; verify CostDeltaTable renders rows
- [ ] 8.8 Lint clean (`npm run lint`) on both workspaces

## 9. CI + landing

- [ ] 9.1 PR opens proposal-only at Gate D for Master review (per `release-management.md` §6.7 from `#12`'s retro)
- [ ] 9.2 Implementation pushed AFTER Gate D approval
- [ ] 9.3 All 8 CI checks green: Lint, Build, Test, Integration, Secrets, CodeRabbit, Build Storybook, (Deploy is master-only)
- [ ] 9.4 Admin-merge once required checks green; CodeRabbit advisory
- [ ] 9.5 Archive `openspec/changes/m2-ui-backfill-wave1/` → `openspec/specs/m2-ui-backfill-wave1/`
- [ ] 9.6 Write `retros/m2-ui-backfill-wave1.md`
- [ ] 9.7 Update auto-memory `project_m1_state.md`
