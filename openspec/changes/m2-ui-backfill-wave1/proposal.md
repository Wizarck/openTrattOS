## Why

Four already-merged backend slices (`#2 m2-recipes-core`, `#3 m2-cost-rollup-and-audit`, `#7 m2-allergens-article-21`, `#8 m2-menus-margins`) each "DEFERRED to UX track" components that ai-playbook §13 mandates ship inside the slice that owns them. `#12 m2-ui-foundation` (PR #81, merged 2026-05-05) corrected the foundation but left the deferred components stranded. This slice closes that debt with the 5 components owed across J1 (Head Chef builds a recipe) and J2 (Head Chef investigates a cost spike).

Without this slice, a chef using `apps/web/` cannot pick a sub-recipe (RecipePicker), pick an ingredient by OFF brand/barcode (IngredientPicker), override a SupplierItem source (SourceOverridePicker), see what changed cost-wise this week (CostDeltaTable), or see/override diet flags (DietFlagsPanel). All five backend endpoints already exist; this is pure UI work consuming them.

## What Changes

- Ship 5 components in `packages/ui-kit/src/components/<Name>/` per the file-layout convention locked in `#12`'s `packages/ui-kit/README.md`: `<Name>.tsx` + `<Name>.stories.tsx` + `<Name>.test.tsx` + `<Name>.types.ts` + `index.ts`.
  - `RecipePicker` (consumes `GET /recipes` from `#2`) — typeahead search by name, returns `{id, name, displayLabel}`. Used in J1 (sub-recipe selection) and J4 (cycle-detection error context).
  - `IngredientPicker` (consumes `GET /ingredients` extended with OFF mirror from `#5` if shipped, else falls back to local-only) — typeahead search by name + brand + barcode. Used in J1.
  - `SourceOverridePicker` (consumes `GET /supplier-items?ingredientId=X` ordered preferred→price; M3 will extend with batches sorted by expiry) — radio-list UI for "Edit source" — used in J1 + J2.
  - `CostDeltaTable` (consumes `GET /recipes/:id/cost-history` + `GET /recipes/:id/cost-delta?from=<date>` from `#3`) — per-component "what changed?" table. Used in J2.
  - `DietFlagsPanel` (consumes `GET /recipes/:id/diet-flags` from `#7`, override via `PUT` Manager+) — visible flags + override UI with required-reason field. Used in J1.
- Wire each component into a journey-screen integration test in `apps/web/src/screens/`:
  - J1 stub `apps/web/src/screens/RecipeBuilderJ1Screen.tsx` (NOT the canonical M2 J1 screen — that lands with `#5` or a future J1 polish slice). Mounts RecipePicker + IngredientPicker + SourceOverridePicker + DietFlagsPanel end-to-end.
  - J2 stub `apps/web/src/screens/CostInvestigationJ2Screen.tsx` mounts CostDeltaTable.
- Each component ships ≥3 Storybook stories (default + loading + error/empty) + ≥10 unit tests (rendering + interaction + a11y attribute regression).
- Storybook publish on master (already wired by `#12`) automatically picks up the 5 new components.
- **BREAKING** (none — pure additive.)

## Capabilities

### New Capabilities

- `m2-ui-backfill-wave1`: 5 ui-kit components + 2 J1/J2 stub screens that consume already-shipped backend endpoints.

### Modified Capabilities

(none — `m2-ui-foundation`'s shell is consumed but not modified.)

## Impact

- **Prerequisites**: `#12 m2-ui-foundation` (merged) — provides apps/web shell + ui-kit + Storybook + tokens.css. `#2`, `#3`, `#7`, `#8` (all merged) — provide the backend endpoints. `#5 m2-ingredients-extension` (NOT yet merged) — IngredientPicker degrades gracefully if its OFF-mirror fields aren't populated yet (text-only search hits the local Ingredient table; OFF brand/barcode columns are optional in the view DTO).
- **Code**: `packages/ui-kit/src/components/{RecipePicker,IngredientPicker,SourceOverridePicker,CostDeltaTable,DietFlagsPanel}/` (5 folders × 5 files = 25 new files); `apps/web/src/screens/{RecipeBuilderJ1Screen,CostInvestigationJ2Screen}.tsx` (2 stub screens); `apps/web/src/main.tsx` (2 new routes added to the router).
- **API surface**: read-only consumption of `GET /recipes`, `GET /ingredients`, `GET /supplier-items`, `GET /recipes/:id/cost-history`, `GET /recipes/:id/cost-delta`, `GET /recipes/:id/diet-flags`. Write: `PUT /recipes/:id/diet-flags` (Manager+). All endpoints already exist.
- **UX**: tablet-first per Head Chef persona (Lourdes on the kitchen tablet); mobile-portrait + desktop fallbacks acceptable. WCAG-AA on diet-flag override modal. Allergen + diet badges always icon + text (re-uses `AllergenBadge` from `#12`).
- **Out of scope**: components owned by unshipped backend slices (`MacroPanel` ships with `#5`, `YieldEditor`+`WasteFactorEditor` with `#6`, `MenuItemRanker` with `#9`, `LabelPreview` with `#10`, `AgentChatWidget` with `#11`). Out of scope: i18n runtime, E2E tests on the canonical J1/J2 screens (those land with their owning slice), authentication flow.
- **Performance**: `<200 ms` interaction latency for typeahead pickers (debounce + TanStack Query stale-while-revalidate); `<500 ms` for CostDeltaTable initial paint.
- **Tech-stack rationale**: inherits `#12`'s ADR-020 lock; no new ADR needed.
