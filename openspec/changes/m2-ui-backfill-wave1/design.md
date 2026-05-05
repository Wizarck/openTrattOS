## Context

`#12 m2-ui-foundation` (PR #81, merged 2026-05-05) shipped 2 components (AllergenBadge + MarginPanel) as proof of contract for the per-component file layout, OKLCH-canonical tokens, Storybook 8 + Vitest test discipline, and the J3 PoC screen. It closed an open architectural question — UI components belong inside the slice that owns them, NOT in a separate "UX track" — but left 5 components owed by the four already-merged backend slices. This slice ships those 5, paired with 2 stub journey screens (J1 + J2) that wire them end-to-end against the existing API.

Foundation locked by `#12`: `apps/web/` (Vite + React 18 + TanStack Query 5 + React Router 6) + `packages/ui-kit/` (Tailwind 4 with `@theme`, OKLCH-canonical `tokens.css`, Storybook 8 with `@storybook/react-vite`). All 5 components inherit those primitives.

## Goals / Non-Goals

**Goals:**
- Ship 5 production-ready components: `RecipePicker`, `IngredientPicker`, `SourceOverridePicker`, `CostDeltaTable`, `DietFlagsPanel`.
- Each component: ≥3 Storybook stories (default + loading + empty/error) + ≥10 Vitest unit tests + per-component file layout (`<Name>/{tsx, stories, test, types, index}`).
- Wire each component end-to-end via 2 stub journey screens at `/poc/recipe-builder-j1` and `/poc/cost-investigation-j2`.
- Storybook static build picks up the 5 new components automatically; the published Storybook URL gains 5 entries.
- WCAG-AA contrast on all states; deuteranopia-safe via icon + text on every status (matches `#12`'s AllergenBadge + MarginPanel pattern).
- Hand-mirrored DTO types per component (`<Name>.types.ts`) to keep ui-kit decoupled from `apps/api/` package layout (codegen pipeline filed as tech debt in `#12` retro).

**Non-Goals:**
- The canonical M2 J1/J2 screens (those land with `#5` or a future polish slice). The stub screens here are integration tests, not the production J1/J2 surfaces.
- Components owned by unshipped backend slices: `MacroPanel` (→ `#5`), `YieldEditor`+`WasteFactorEditor` (→ `#6`), `MenuItemRanker` (→ `#9`), `LabelPreview` (→ `#10`), `AgentChatWidget` (→ `#11`).
- E2E tests (Playwright/Cypress) — Vitest unit + Storybook stories cover the contract; E2E lands with the canonical journey-screen slice.
- i18n runtime — labels are English literals for now; locale wiring lands separately.
- Authentication — stub screens accept `?organizationId=<orgId>` query param; real auth lands with `#11` (MCP) or a dedicated auth slice.

## Decisions

- **Per-component DTO type files** (`<Name>.types.ts`) hand-mirror the API DTO shapes. **Rationale**: ui-kit must not import from `apps/api/`. Filed in `#12` retro as future codegen work; deferring to keep this slice surgical.
- **TanStack Query hooks live in `apps/web/src/hooks/`**, NOT in `packages/ui-kit/`. **Rationale**: ui-kit components receive props (data + callbacks); they don't fetch. This keeps ui-kit usable in Storybook with mocked data and reusable outside `apps/web/`.
- **Typeahead debounce: 250 ms** for `RecipePicker` and `IngredientPicker`. **Rationale**: balances chef-typing speed against backend load; matches industry-standard search-as-you-type latency.
- **Empty-state copy is a per-component prop**, not hardcoded. **Rationale**: testable without locale infrastructure; allows future i18n to thread through props.
- **`SourceOverridePicker` shows preferred FIRST then by price ascending**. **Rationale**: ADR-014 (PreferredSupplierResolver) — chef expects the preferred to land at top; price-ordered tie-breakers below.
- **`CostDeltaTable` rows colour-code per delta direction**: increase = `--color-status-at-risk`, decrease = `--color-status-on-target`, no-change = `--color-fg-muted`. **Rationale**: matches `MarginPanel`'s status palette; deuteranopia-safe via accompanying arrow icon (`↑` or `↓`).
- **`DietFlagsPanel` override modal requires a `reason` field** of ≥10 chars. **Rationale**: matches the backend contract (PUT requires reason per `#7`'s controller); UI enforces client-side too for immediate feedback.
- **No per-row drill-down navigation** in this slice's CostDeltaTable. **Rationale**: drill-down is a J2-canonical feature that the stub screen doesn't need to implement; future polish slice owns it.

## Risks / Trade-offs

- [Risk] Hand-mirrored DTOs rot as the API evolves. **Mitigation**: `#12` retro filed codegen pipeline as tech debt. For now, the 5 type files are <30 LOC each and reflect endpoints that are unlikely to churn before codegen lands.
- [Risk] IngredientPicker's OFF-mirror fields (`brandName`, `barcode`) may be empty for Ingredients pre-`#5`. **Mitigation**: the picker degrades to text-search-only when those fields are null; visual layout reserves space for them but renders empty span.
- [Risk] Stub journey screens diverge from the canonical J1/J2 design lockdown when the canonical slice eventually ships. **Mitigation**: stub screens live at `/poc/<journey>-j<N>` paths (NOT `/recipes/builder` or similar); replacement is a single-file delete + new import. Storybook stories are the canonical contract; stubs are throwaway.
- [Risk] Storybook static build size grows past the 500 KB v0 target. **Mitigation**: `#12` baseline was 90 KB; +5 components × ~10 KB each = ~140 KB total; well under target.
- [Risk] `DietFlagsPanel` override write happens from the chef's tablet without optimistic update; user perceives lag. **Mitigation**: optimistic update via TanStack Query `onMutate` callback; rollback on error.

## Migration Plan

Phase 1 — RecipePicker + IngredientPicker (foundational typeahead pattern):
1. Create `packages/ui-kit/src/components/RecipePicker/` (5 files). Tests: render, search interaction, keyboard navigation, empty state, loading state, a11y. Storybook: default, loading, empty, with-results, keyboard-focus.
2. Create `packages/ui-kit/src/components/IngredientPicker/` (5 files). Same scope; OFF-fields handled gracefully.

Phase 2 — SourceOverridePicker:
3. Create `packages/ui-kit/src/components/SourceOverridePicker/` (5 files). Tests: render, radio-list selection, preferred-first ordering, price-tie-break, override-applied event. Storybook: default, single option, multiple options, no preferred, no options.

Phase 3 — CostDeltaTable:
4. Create `packages/ui-kit/src/components/CostDeltaTable/` (5 files). Tests: row rendering, delta colour-coding, arrow-icon presence, empty history, pagination/virtualisation handled by parent. Storybook: default, no changes, only-increases, only-decreases, mixed.

Phase 4 — DietFlagsPanel:
5. Create `packages/ui-kit/src/components/DietFlagsPanel/` (5 files). Tests: render visible flags, override modal opens, reason validation, optimistic update + rollback, RBAC gating (override hidden for Staff). Storybook: default, with-override, override-modal-open, validation-error.

Phase 5 — Journey-screen stubs:
6. `apps/web/src/screens/RecipeBuilderJ1Screen.tsx` — uses RecipePicker + IngredientPicker + SourceOverridePicker + DietFlagsPanel against `?recipeId=<id>` + `?organizationId=<orgId>` query params.
7. `apps/web/src/screens/CostInvestigationJ2Screen.tsx` — uses CostDeltaTable against `?recipeId=<id>` + `?from=<date>` query params.
8. Wire 2 new routes in `apps/web/src/main.tsx`: `/poc/recipe-builder-j1` and `/poc/cost-investigation-j2`.

Phase 6 — Verification:
9. `npm test` (apps/web + packages/ui-kit) — 5 components × ≥10 tests = ≥50 new tests.
10. `npm run build` (apps/web) — bundle size <300 KB gzipped.
11. `npm run build-storybook` — 7 components total in static output (`#12`'s 2 + this slice's 5).

Rollback: revert; backend endpoints unchanged. The 2 stub screens are throwaway routes; production app is unaffected.

## Open Questions

(none — scope is fully determined by the 5 components named in row #13's scope note + the 2 stub screens for journey integration.)
