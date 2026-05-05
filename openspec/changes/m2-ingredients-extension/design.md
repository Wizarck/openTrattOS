## Context

M1 shipped `Ingredient` with name, baseUnit, category. M2 needs nutrition (kcal/macros), allergens, dietFlags, brand provenance — all OFF-derived where possible. Schema fields landed in `#1 m2-data-model`; the OFF mirror landed in `#4 m2-off-mirror`. This slice ships the chef-facing surface: extended Ingredients endpoints, the OFF-backed search + prefill flow, override semantics, the macro rollup endpoint, and the `MacroPanel` component.

**Important scope correction post-#13**: `IngredientPicker` and `SourceOverridePicker` were already shipped in `#13 m2-ui-backfill-wave1` (with the OFF graceful-degrade behaviour — they render brand/barcode lines when present and fall back to single-line otherwise). This slice closes the OFF dependency by ensuring the backend `GET /ingredients` payload populates `brandName` + `barcode` from the OFF mirror via `#4`'s `ExternalCatalogService`. Only **`MacroPanel`** is new component work in this slice.

## Goals / Non-Goals

**Goals:**
- Search-by-barcode endpoint hitting the OFF mirror with API fallback (FR21).
- `prefillFromOff(externalCatalogRow)` mapping OFF row → Ingredient creation DTO with `nutrition` / `allergens` / `dietFlags` / `brandName` / `externalSourceRef` populated.
- Manager+ override flow (FR23): any OFF-pulled field overridable with attribution + reason.
- `MacroPanel` component at `packages/ui-kit/src/components/MacroPanel/` — kcal + macros per portion AND per 100g, ODbL attribution line when `externalSourceRef` set, compact + expanded views.
- Recipe-level macro rollup endpoint (FR24): `GET /recipes/:id/macros` returning per-portion + per-100g.
- **Lift `walkRecipeTree` helper** to a single source of truth before reimplementing for the 4th time. Sites today: `cycle-detector.ts`, `cost.service.ts`, `recipes-allergens.service.ts`. Filed in #8 + #13 retros.

**Non-Goals:**
- Recipe-level allergen aggregation: shipped in `#7`.
- Label rendering: `#10`.
- Full Recipe CRUD: shipped in `#2`.
- `IngredientPicker` + `SourceOverridePicker`: shipped in `#13` (graceful-degrade already in place).

## Decisions

- **Override stored as a single `overrides` jsonb column on Ingredient** (per Open Question 1). Shape: `{ allergens?: { value, reason, appliedBy, appliedAt }, dietFlags?: {...}, nutrition?: {...}, brandName?: {...} }`. **Rationale**: overrides are typically 0-2 per Ingredient; a single jsonb avoids 4-8 sibling columns and matches `#7`'s pattern. The "override-jsonb is the convention" note from M2 retros (audit_log still pending) makes this the consistent choice.
- **`MacroPanel` renders both per-portion and per-100g.** Compact = portion only; expanded = both. **Rationale**: chefs reason in portions; nutritionists/regulators expect per-100g (Article 30). Both views ship in one component, controlled via prop.
- **Recipe macro rollup is computed at read time, not stored.** **Rationale**: stored rollup goes stale on ingredient updates; live computation reuses `walkRecipeTree`.
- **Lift `walkRecipeTree` BEFORE reimplementing.** Extract to `apps/api/src/recipes/application/recipe-tree-walker.ts`. Refactor existing 3 sites; add macro-rollup as the 4th caller from day one.
- **Search latency contract**: <50ms p50 against the local mirror, <500ms p95 including API fallback. **Rationale**: chef workflow is fluid (PRD Performance NFR).
- **Per-component file layout for `MacroPanel`**: `packages/ui-kit/src/components/MacroPanel/{tsx, stories, test, types, index}` per `#12` convention. Hand-mirrored DTO types until codegen pipeline lands.

## Risks / Trade-offs

- [Risk] OFF nutrition shape varies (per-100g vs per-portion). **Mitigation**: persist OFF payload as-is in `nutrition` jsonb; normalise to per-100g on read with a fallback to portion-divided when `serving_size_g` is set.
- [Risk] Refactoring `walkRecipeTree` to a shared helper risks breaking the 3 existing callers. **Mitigation**: pure-function refactor; all 459 backend tests must stay green; don't merge until they do.
- [Risk] Override audit blast: every field edit emits an event; audit_log table doesn't exist yet. **Mitigation**: emit `INGREDIENT_OVERRIDE_CHANGED` event for future audit listener; payload carries everything a future listener needs (no coupling today).
- [Risk] Bilingual `dietFlags` rendering (Master is ES/EN). **Mitigation**: dietFlags are enum strings; UI translates per locale. No DB-side change.

## Migration Plan

Steps:
1. **Lift `walkRecipeTree` helper** to `apps/api/src/recipes/application/recipe-tree-walker.ts`. Refactor `cost.service.ts` + `recipes-allergens.service.ts` + `cycle-detector.ts` to consume it (3 sites; pure-function refactor). All 459 backend tests must stay green.
2. Migration `0014_ingredients_overrides_column.ts` adds `overrides jsonb DEFAULT '{}'::jsonb NOT NULL`.
3. IngredientsService extensions: `searchByBarcode(orgId, barcode)`, `prefillFromOff(externalCatalogRow)`, `applyOverride(orgId, userId, ingredientId, field, value, reason)` (jsonb merge).
4. New endpoint `GET /ingredients/search?barcode=` consuming `#4`'s `ExternalCatalogService`.
5. Extended `PUT /ingredients/:id` accepts `overrides` payload (Manager+ only; reason ≥10 chars per `#13`'s pattern).
6. `IngredientsService.getMacroRollup(orgId, recipeId)` consumes `walkRecipeTree`; sums `nutrition × quantity × yield × (1 − waste)`.
7. New endpoint `GET /recipes/:id/macros` (all roles) returning `{ perPortion, per100g, externalSources: [...] }` for ODbL attribution.
8. `MacroPanel` component (5 files) + barrel re-export.
9. Tests: ≥10 ui-kit unit tests + service unit tests + INT spec (Docker-deferred).

Rollback: revert; the migration is additive (jsonb default `{}`); `#1`'s columns stay nullable.

## Open Questions

1. **Override storage shape.** Pre-existing design said "sibling fields per overridable column" (4-8 new columns). Post-#7's diet-flags-override pattern (jsonb on Recipe), I propose a single `overrides` jsonb column on Ingredient. Options:
   - (a) **Single jsonb `overrides` column** (4-8 fewer columns; matches `#7`'s pattern)
   - (b) Sibling `<field>OverrideAt` + `<field>OverrideReason` columns per overridable field (typed columns; more JOIN-friendly)

2. **Override `reason` minimum length.** `#7` accepts ≥1 server-side; `#13`'s DietFlagsPanel enforces ≥10 client-side (Gate D decision 2). Options:
   - (a) **Match `#13`**: ≥10 client-side, ≥1 server-side (current convention)
   - (b) Stricter: ≥10 both client + server
   - (c) Permissive: ≥1 both

3. **`MacroPanel` ODbL attribution.** When ANY ingredient in the rollup has `externalSourceRef` set, MacroPanel shows "Some nutritional data from Open Food Facts (ODbL)" per ADR-015. Options:
   - (a) **Always visible** when any source is OFF (compliance margin > UI density)
   - (b) Only in expanded view; tooltip in compact

Recommendation: **1a / 2a / 3a**. Reply "yes to all" or pick differently.
