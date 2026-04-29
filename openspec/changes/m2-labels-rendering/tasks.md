## 1. Label-renderer package

- [ ] 1.1 Create `packages/label-renderer/` with TypeScript + `@react-pdf/renderer`
- [ ] 1.2 Define `LabelData` interface: `{recipe: {name, ingredientList, macros, allergens, crossContamination, netQuantity}, org: {businessName, contactInfo, address, brandMark, postalAddress}, locale}`
- [ ] 1.3 Implement `LabelDocument` React component composing header / ingredient list / allergen panel / macro panel / footer
- [ ] 1.4 Storybook visual tests for each section + full label
- [ ] 1.5 Locale resolution: shared i18n bundle for `es`, `en`, `it` (M2 supported set)

## 2. Server-side resolver + endpoint

- [ ] 2.1 `LabelDataResolver` in `apps/api/src/labels/` walks Recipe + Org context to populate `LabelData`
- [ ] 2.2 Mandatory-field validation per Article 9; throws `MissingMandatoryFieldsError` listing every missing field
- [ ] 2.3 `GET /recipes/:id/label?locale=` endpoint streams the rendered PDF
- [ ] 2.4 Server-side cache: 5-min TTL keyed `(recipeId, locale, recipeUpdatedAt, orgUpdatedAt)`
- [ ] 2.5 422 on missing fields with structured error; never emits incomplete PDF

## 3. Org config endpoint

- [ ] 3.1 `PUT /orgs/:id/label-fields` — Owner role only
- [ ] 3.2 Validates all required fields present; rejects partial configs with 422
- [ ] 3.3 Persist to `Org.labelFields` jsonb (or dedicated columns — design choice in implementation)

## 4. UI: LabelPreview

- [ ] 4.1 `packages/ui-kit/src/label-preview/` — uses same `LabelData` shape; client-side preview via `@react-pdf/renderer` browser build
- [ ] 4.2 Print button → opens browser print dialog with PDF
- [ ] 4.3 Download button → triggers PDF download
- [ ] 4.4 Three-click print flow: "Print Label" → preview opens → confirm
- [ ] 4.5 Storybook stories for each ingredient pattern (simple recipe, sub-recipe nested, all-allergens, no-allergens)
- [ ] 4.6 ARIA: preview accessible; print/download buttons labelled

## 5. Tests

- [ ] 5.1 Unit: ingredient ordering by descending mass (single-level + sub-recipe)
- [ ] 5.2 Unit: allergen emphasis renders bold + icon (visual snapshot test)
- [ ] 5.3 Unit: missing org contactInfo → 422 with named missing field
- [ ] 5.4 Unit: missing Recipe macros → 422
- [ ] 5.5 E2E: full label generation for a complete Recipe + Org
- [ ] 5.6 E2E: locale=zz unsupported → 422
- [ ] 5.7 E2E: chef workflow — Recipe view → Print Label → preview → confirm = 3 clicks
- [ ] 5.8 Performance: PDF generation p95 <2s

## 6. Compliance + legal review

- [ ] 6.1 Document mandatory-fields list per EU 1169/2011 Article 9 in `docs/labels/article-9-fields.md`
- [ ] 6.2 ES + IT locale bundles reviewed by food-law counsel before production deploy
- [ ] 6.3 Pre-launch external legal review per ADR-019 §Risk — written report attached to change retro
- [ ] 6.4 Verify allergen emphasis matches Article 21 reference visualisations

## 7. Verification

- [ ] 7.1 Run `openspec validate m2-labels-rendering` — must pass
- [ ] 7.2 Manual smoke: print 3 different recipe types (single-level, sub-recipe, all-allergens) on a real printer
- [ ] 7.3 Confirm 3-click print flow on a real device (kitchen tablet)
- [ ] 7.4 Pre-launch legal sign-off recorded in change retro before prod deploy
