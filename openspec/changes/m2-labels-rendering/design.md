## Context

EU 1169/2011 compliant labels are M2's regulatory + commercial differentiator. Without one-click printable labels, the kitchen still hand-writes ingredient lists per Article 18 (descending mass) and Article 21 (allergen emphasis). ADR-019 picks `@react-pdf/renderer` over Puppeteer for CI determinism + npm-ecosystem fit. Pre-launch external legal review is a hard gate. Foundation: `#5 m2-ingredients-extension` provides allergens + macros; `#7 m2-allergens-article-21` provides Recipe-level aggregation.

## Goals / Non-Goals

**Goals:**
- Printable label generation for any Recipe (FR34) using `@react-pdf/renderer`.
- Article 18: ingredients ordered by descending mass.
- Article 21: allergens emphasised — bold + high contrast, **icon + text always** (NFR Accessibility, never colour-only).
- Kcal/macro panel from Recipe macroRollup.
- Net quantity per portion + org-configured contact info.
- Locale per org `defaultLocale` (FR35).
- Refusal-on-incomplete (FR36): refuse to print if any mandatory field missing, naming the gap.
- Owner configures org-level label fields (FR37).
- `LabelPreview` UI paired with the PDF renderer.
- ≤3 clicks to print per NFR.
- Pre-launch external legal review per ADR-019 §Risk.

**Non-Goals:**
- Bilingual labels (M2.x).
- Industrial label-printer integrations (M3).
- Recipe-level allergen aggregation logic (already in `#7`).

## Decisions

- **`@react-pdf/renderer` over Puppeteer**. **Rationale**: ADR-019 — react-pdf renders deterministically in CI without browser dependency; Puppeteer needs Chromium in test runner + occasionally produces flaky pixel diffs. react-pdf's React API also makes the label structure component-based and inspectable.
- **Label-renderer in its own package** `packages/label-renderer/`. **Rationale**: isolates @react-pdf/renderer dependency; consumed by `apps/api/` (server-side render for `GET /recipes/:id/label`) and `packages/ui-kit/src/label-preview/` (client preview).
- **Ingredient ordering by descending mass** computed at render time from RecipeIngredient lines. **Rationale**: mass is `quantity × yield × (1 − waste)` — same path as cost rollup; one tree walk produces both.
- **Refusal-on-incomplete**: explicit list of mandatory fields per Article 9 (name, ingredient list with allergens, net quantity, mandatory particulars, allergens emphasised, country of origin if not implied, instructions if applicable, business name + address). The renderer validates pre-emit and returns `{code: "MISSING_MANDATORY_FIELDS", missing: [...]}` rather than emitting an incomplete PDF.
- **Locale per org `defaultLocale`** — labels render in the org's chosen language (Spanish for Palafito, English for international). **Rationale**: PRD §FR35 explicit; bilingual labels deferred to M2.x.
- **Pre-launch external legal review** is a deploy gate, not a code gate. **Rationale**: code can land in CI; production deploy of `/recipes/:id/label` requires the legal sign-off, recorded in the change retro.

## Risks / Trade-offs

- [Risk] @react-pdf/renderer doesn't support arbitrary CSS — limited to its component primitives. **Mitigation**: design the label as a fixed structure (header / ingredient list / allergen panel / macro panel / footer) that maps to react-pdf primitives. Storybook visually validates.
- [Risk] EU 1169 compliance has nuances per member state (e.g. Germany requires QR codes in certain contexts). **Mitigation**: M2 ships ES + IT defaults; pre-launch legal review extends to per-country variants if required. M3 may parameterise.
- [Risk] PDF generation latency. **Mitigation**: react-pdf renders ~200-500ms for typical recipe; cache identical inputs (recipe + locale) for 5 min server-side; client preview is debounced.

## Migration Plan

Steps:
1. New package `packages/label-renderer/` with `@react-pdf/renderer` dep.
2. `LabelDocument` React component composing header / ingredient list / allergen panel / macro panel / footer; reads from a typed `LabelData` shape.
3. `LabelDataResolver` service in `apps/api/` that walks the Recipe + Org context to populate `LabelData`; validates mandatory fields; throws `MissingMandatoryFieldsError` on gap.
4. `GET /recipes/:id/label?locale=` endpoint streams the rendered PDF.
5. `LabelPreview` UI component in `packages/ui-kit/` consumes the same `LabelData` shape for client-side preview.
6. Org-level fields config: `PUT /orgs/:id/label-fields` (Owner only) persists contact info / address / brand mark / postal address.
7. Pre-launch external legal review: written report from food-law counsel reviewing ES + IT label outputs against current 1169/2011 + member state requirements.

Rollback: remove the route + Owner config endpoint; UI degrades to "labels coming soon"; no data loss.

## Open Questions

- QR-code embedding (some country variants): defer to M2.x or per-customer? **Pending**: legal review will inform.
