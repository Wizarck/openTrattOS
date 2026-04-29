## Why

EU 1169/2011 Article 21 mandates conspicuous emphasis of the 14 named allergens; this is not optional and not styling — it's a regulatory contract. Recipe-level allergen + diet-flag computation is also where conservative inference matters: never auto-clear an allergen, never assert a diet flag the data doesn't fully support. This slice is the safety floor that #10 (label rendering) builds on.

## What Changes

- Recipe-level allergen aggregation (FR25): conservative — ANY allergen in ANY ingredient bubbles up to the Recipe; never auto-clear.
- Cross-contamination override (FR26): Manager can add a Recipe-level "may contain traces of [allergen]" note (free-text, audit-trailed).
- Recipe-level diet-flag inference (FR27): conservative — a flag is true only if all ingredients carry it AND no contradicting allergen is present.
- Manager+ override flow (FR28): Manager+ role can override aggregated allergens or inferred dietFlags with attribution + reason.
- `AllergenBadge` UI component (per `docs/ux/components.md`): Article 21 emphasis — bold + high contrast, **icon + text always** per NFR Accessibility (never colour-only).
- `DietFlagsPanel` UI component: vegan / vegetarian / gluten-free / halal / kosher / keto with chef override.
- All allergen rendering is screen-reader friendly per NFR Accessibility.
- **BREAKING** (none.)

## Capabilities

### New Capabilities

- `m2-allergens-article-21`: Recipe-level allergen aggregation + diet-flag inference + Manager+ override + Article-21-compliant rendering.

### Modified Capabilities

(none — Recipe gains a computed `allergens` and `dietFlags` summary, but that's added on top of the M2-data-model schema, not a delta to an existing M1 spec.)

## Impact

- **Prerequisites**: `#1 m2-data-model`, `#5 m2-ingredients-extension` (Ingredient must carry `allergens` + `dietFlags`).
- **Code**: `apps/api/src/recipes/allergens/` (aggregation service), `packages/ui-kit/src/allergen-badge/`, `diet-flags-panel/`.
- **API surface**: `GET /recipes/:id/allergens`, `GET /recipes/:id/diet-flags`. Both endpoints return source attribution (which ingredient raised which allergen).
- **Compliance**: ADR-017 mandates Article 21 emphasis on every consumer of `AllergenBadge`. Pre-launch external legal review per ADR-019 §Risk applies to the rendering path (#10).
- **Out of scope**: how labels render these — that's #10.
