## Why

Module 2 augments the M1 Ingredient with nutrition (kcal/macros), allergens, diet flags, and brand provenance — the data that powers Recipes' label generation, allergen aggregation, and Owner reporting. The pre-fill UX backed by the OFF mirror (`#4`) is what makes ingredient setup fast for the chef (Journey 1, FR21–24) instead of manual data entry per ingredient. This slice consumes #4 and ships the chef-facing pickers + macro panel.

## What Changes

- Ingredient creation + edit augmented with OFF-backed pre-fill (FR21–24).
- Search by name / brand / barcode against the local OFF mirror with API fallback (FR21).
- On match, pre-fill `nutrition`, `allergens`, `dietFlags`, `brandName`; record `externalSourceRef` (FR22).
- Manager can override any OFF-pulled field with attribution + reason (FR23).
- `IngredientPicker` UI component (per `docs/ux/components.md`) — search-by-name/brand/barcode against the OFF mirror.
- `SourceOverridePicker` UI component — M2 lists SupplierItems sorted preferred → price (M3 will sort batches by expiry, contract stays stable).
- `MacroPanel` UI component — kcal/macros per portion + per 100g, compact + expanded views. Reused at the Recipe level in #3 once cost-rollup needs nutritional rollup.
- Recipe-level macro rollup view (FR24): kcal and macros per finished portion AND per 100g, computed from the ingredient `nutrition` jsonb.
- **BREAKING** (none.)

## Capabilities

### New Capabilities

- `m2-ingredients-extension`: OFF-backed Ingredient UX (pickers + macro panel) + override flow. Consumes #4 for catalog data.

### Modified Capabilities

- `ingredients` (M1 spec): Ingredient now exposes `nutrition`, `allergens`, `dietFlags`, `brandName`, `externalSourceRef` fields with override-with-attribution semantics. Read-side endpoints add these fields to existing payloads (additive, but spec-level behavior changes hence delta-spec rather than implicit).

## Impact

- **Prerequisites**: `#1 m2-data-model` (column extensions), `#4 m2-off-mirror` (catalog).
- **Code**: `apps/api/src/ingredients/` extensions, `packages/ui-kit/src/ingredient-picker/`, `source-override-picker/`, `macro-panel/`.
- **API surface**: extended Ingredient endpoints (`GET/POST/PUT /ingredients`) with new fields. New `GET /ingredients/search?q=&barcode=` against the OFF mirror.
- **UX touchpoints**: Journey 1 ingredient setup must complete in ≤3 fields visible (Master is bilingual ES/EN; pre-fill keeps it short).
- **Out of scope**: Recipe-level allergen aggregation (#7), label rendering (#10).
