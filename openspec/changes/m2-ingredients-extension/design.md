## Context

M1 shipped `Ingredient` with name, baseUnit, category. M2 needs nutrition (kcal/macros), allergens, dietFlags, brand provenance — all OFF-derived where possible. Schema fields land in `#1 m2-data-model`; the OFF mirror is `#4 m2-off-mirror`. This slice ships the chef-facing surface: pickers, override flow, MacroPanel.

## Goals / Non-Goals

**Goals:**
- Ingredient creation with OFF-backed pre-fill (FR21–24).
- Search by name / brand / barcode against the local mirror with API fallback.
- Manager override flow (FR23): any OFF-pulled field overridable with attribution + reason.
- `IngredientPicker` (search-by-name/brand/barcode), `SourceOverridePicker` (preferred SupplierItem + override), `MacroPanel` UI components.
- Recipe-level macro rollup view (FR24): kcal + macros per portion AND per 100g.

**Non-Goals:**
- Recipe-level allergen aggregation: `#7`.
- Label rendering: `#10`.
- Full Recipe CRUD: `#2`.

## Decisions

- **Override stored on Ingredient** (not on a separate `IngredientOverride` table). Each overridable field has a sibling `<field>OverrideAt` + `<field>OverrideReason`. **Rationale**: overrides are typically 0-2 per Ingredient; a separate table doubles JOINs on the ingredient read path. Audit trail kept in `audit_log` for full history.
- **MacroPanel renders both per-portion and per-100g.** **Rationale**: chefs reason in portions; nutritionists/regulators expect per-100g per Article 30. Both views ship.
- **Recipe macro rollup is computed at read time, not stored.** **Rationale**: stored rollup goes stale on ingredient updates; live computation is the same code path used for cost rollup (`#3`) — same walking pattern.
- **Search latency contract**: <50ms p50 against the local mirror, <500ms p95 including API fallback. **Rationale**: chef workflow is fluid (PRD Performance NFR).

## Risks / Trade-offs

- [Risk] OFF nutrition shape varies (per-100g vs per-portion). **Mitigation**: persist OFF payload as-is in `nutrition` jsonb; normalise to per-100g on read with a fallback to portion-divided.
- [Risk] Override audit blast: every field edit generates a row. **Mitigation**: `audit_log` already pattern-established; truncate to 90 days for high-traffic projects (M3+).
- [Risk] Bilingual `dietFlags` rendering (Master is ES/EN). **Mitigation**: dietFlags are enum strings; UI translates per locale. No DB-side change.

## Migration Plan

Steps:
1. IngredientsService extensions in `apps/api/src/ingredients/`: `searchExternal()`, `prefillFromOff()`, `applyOverride()`.
2. New `GET /ingredients/search?q=&barcode=&brand=` endpoint consuming `#4`'s ExternalCatalogService.
3. UI components in `packages/ui-kit/src/{ingredient-picker,source-override-picker,macro-panel}/`.
4. Recipe macro endpoint: `GET /recipes/:id/macros` walking the Recipe tree summing nutrition × quantity × yield × (1 − waste).
5. Tests cover the search + prefill + override flows end-to-end.

Rollback: revert; `#1`'s columns remain as nullable (no data loss). UI gracefully degrades to manual entry.

## Open Questions

(none.)
