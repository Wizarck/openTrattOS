## Why

EU 1169/2011 compliant labels are M2's regulatory and commercial differentiator. Without one-click printable labels, the kitchen still hand-writes ingredient lists for Article 18 (descending mass) and Article 21 (allergen emphasis), every time. ADR-019 picks `@react-pdf/renderer` over Puppeteer for CI determinism and npm-ecosystem fit. Pre-launch external legal review is a hard gate.

## What Changes

- Printable label generation for any Recipe (FR34) using `@react-pdf/renderer` per ADR-019.
- EU 1169/2011 Article 18: ingredients ordered by descending mass.
- EU 1169/2011 Article 21: allergens visually emphasised — bold + high contrast, **icon + text always** per NFR Accessibility (never colour-only).
- Kcal/macro panel rendered from Recipe macroRollup (FR24 result).
- Net quantity per portion + org-configured contact info (org name, postal address, brand mark) (FR34, FR37).
- Locale per org `defaultLocale` (FR35) — labels render in the org's chosen language; bilingual layouts not in M2 scope.
- Refusal-on-incomplete (FR36): system refuses to print a label if any mandatory field is missing, naming the gap (chef gets actionable error).
- Owner configures org-level label fields (contact info, address, brand mark, postal address) (FR37).
- `LabelPreview` UI component (per `docs/ux/components.md`) paired with the PDF renderer.
- Print workflow ≤3 clicks per NFR.
- Pre-launch external legal review per ADR-019 §Risk — gates the prod release of this slice.
- **BREAKING** (none.)

## Capabilities

### New Capabilities

- `m2-labels-rendering`: EU 1169/2011 label generation via `@react-pdf/renderer` + Owner-configurable label fields + refusal-on-incomplete validation.

### Modified Capabilities

(none.)

## Impact

- **Prerequisites**: `#5 m2-ingredients-extension` (allergens + macros), `#7 m2-allergens-article-21` (Recipe-level allergen + diet-flag aggregation).
- **Code**: `packages/label-renderer/` (new package, isolating @react-pdf/renderer dependency), `apps/api/src/labels/` (PDF generation endpoint), `packages/ui-kit/src/label-preview/`.
- **External dependencies**: `@react-pdf/renderer` (npm). Pre-launch external legal review per ADR-019 §Risk.
- **API surface**: `GET /recipes/:id/label?locale=` returning PDF stream.
- **Compliance**: every label PDF carries the org's mandatory fields per FR34. Refusal mode emits structured error naming missing fields.
- **Out of scope**: bilingual labels (M2.x), industrial label-printer integrations (M3).
