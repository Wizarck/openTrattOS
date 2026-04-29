## 1. IngredientsService extensions

- [ ] 1.1 `searchExternal(orgId, query, barcode, brand)` — delegate to ExternalCatalogService from #4
- [ ] 1.2 `prefillFromOff(externalCatalogRow)` — map OFF row → Ingredient creation DTO with `nutrition`/`allergens`/`dietFlags`/`brandName`/`externalSourceRef`
- [ ] 1.3 `applyOverride(orgId, userId, ingredientId, field, value, reason)` — write override + audit_log row; reject if reason missing
- [ ] 1.4 `getMacroRollup(orgId, recipeId)` — walks Recipe tree, sums nutrition × quantity × yield × (1 − waste); returns per-portion + per-100g

## 2. Endpoints

- [ ] 2.1 `GET /ingredients/search?q=&barcode=&brand=` — public, scoped by org
- [ ] 2.2 `POST /ingredients` — extended payload accepts `externalSourceRef` + OFF-pulled fields
- [ ] 2.3 `PUT /ingredients/:id` — Manager+ only when overriding OFF-pulled fields, requires `reason` in body
- [ ] 2.4 `GET /recipes/:id/macros` — returns per-portion + per-100g rollup
- [ ] 2.5 RBAC guard rejects Staff overrides with 403; rejects missing reason with 422

## 3. UI components

- [ ] 3.1 `packages/ui-kit/src/ingredient-picker/` — search-by-name/brand/barcode against `/ingredients/search`
- [ ] 3.2 `packages/ui-kit/src/source-override-picker/` — M2: lists SupplierItems sorted preferred → price; UI contract preserved for M3 batch sorting
- [ ] 3.3 `packages/ui-kit/src/macro-panel/` — compact + expanded views; renders both per-portion and per-100g; ODbL attribution line when `externalSourceRef` set
- [ ] 3.4 Storybook stories for all 3 components covering empty / loading / with-data / OFF-attributed states
- [ ] 3.5 ARIA: combobox patterns on pickers; semantic table on MacroPanel

## 4. Tests

- [ ] 4.1 E2E: search by barcode → select OFF result → create Ingredient → verify pre-filled fields
- [ ] 4.2 E2E: Manager overrides allergens with reason → audit_log row written; new value persisted
- [ ] 4.3 E2E: override without reason returns 422
- [ ] 4.4 E2E: Staff override returns 403
- [ ] 4.5 E2E: macro rollup correct for Recipe with mixed Ingredient + sub-Recipe components
- [ ] 4.6 E2E: ODbL attribution renders on IngredientPicker + MacroPanel for OFF-sourced rows
- [ ] 4.7 Performance: search by name p95 <500ms (fallback path included)

## 5. Verification

- [ ] 5.1 Run `openspec validate m2-ingredients-extension` — must pass
- [ ] 5.2 Manual smoke: Journey 1 ingredient setup — barcode scan → autofill → save in <30s
- [ ] 5.3 Confirm M1 ingredient endpoints still pass their existing test suite (additive contract)
