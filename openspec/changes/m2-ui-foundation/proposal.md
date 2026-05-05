## Why

ai-playbook's UX Track (`.ai-playbook/specs/ux-track.md` v2.0.0) treats component implementation — TSX + Storybook stories + Tailwind tokens consuming `DESIGN.md` — as part of each OpenSpec slice that touches a UI component, not as a separate phase. Per §13: *"Components are developed in **Storybook with stories** before they appear on a screen… After review, components promote to the consumer's `packages/ui-kit/`. **Storybook is published in CI for static review on every PR.**"*

The first 8 slices of openTrattOS (M1 + M2 wave 0/1/2/3) shipped backend-only and deferred §UI-components in every retro to "the UX track". That defer was a misread: the UX track produces the design artefacts (`DESIGN.md`, journey docs, components catalogue — all done at Gate B); the implementation of components belongs in their owning slice. We diverged from the contract for 4 slices in a row (`m2-recipes-core`, `m2-cost-rollup-and-audit`, `m2-menus-margins`, `m2-allergens-article-21`).

Two structural blockers are the actual reason the defer kept happening:

1. **No `apps/web/` exists.** The API at `apps/api/` is monolithic NestJS with no consumer. There's nowhere to mount a component, so "component shipped with the slice" was physically impossible.
2. **No `packages/ui-kit/` is configured.** `packages/ui-kit/` only contains `types/` from M1. There's no Tailwind 4 theme, no Storybook, no shadcn primitives, no design-token plumbing. There's no library to ship components into.

This slice fixes both blockers. After this lands, the remaining 5 M2 slices (`m2-ai-yield-suggestions`, `m2-ingredients-extension`, `m2-labels-rendering`, `m2-mcp-server`, `m2-owner-dashboard`) each ship backend + UI components + Storybook stories within their own slice — which is what ai-playbook said all along.

A sibling backfill slice (`m2-ui-backfill-wave1`) will then add the UI components for the 4 already-shipped backend slices: `RecipePicker`, `IngredientPicker`, `SourceOverridePicker`, `CostDeltaTable`, `DietFlagsPanel`. That slice is filed but NOT in scope here.

## What Changes

- **`apps/web/` shell** — Vite + React 18 + React Router + TanStack Query. Tablet-first per Journey 1; mobile-aware per Journey 3. NOT Next.js (no SSR requirement; the API is the contract per ADR-013, the UI is one of many consumers).
- **`packages/ui-kit/` setup** — Tailwind 4 with `@theme` block populated from `docs/ux/DESIGN.md` YAML frontmatter; shadcn/ui as base layer (per ai-playbook §13); design-token provider that reads OKLCH-canonical CSS variables; Storybook 8 with the 9-section catalogue scaffolding; one bundled build (`tsup` or Vite-lib).
- **OKLCH-canonical surfacing** — every token from `DESIGN.md`'s `:root { --token: oklch(...) }` block reaches the runtime CSS unchanged. Hex computed equivalents in `DESIGN.md`'s YAML frontmatter are exported only for downstream tooling (Figma, DTCG); they are NEVER round-tripped back into CSS.
- **First 2 components shipped** to validate the chain end-to-end:
  - `AllergenBadge` (regulatory-significant, smallest data-shape, used by `m2-allergens-article-21`'s `GET /recipes/:id/allergens` endpoint)
  - `MarginPanel` (consumes both `GET /recipes/:id/cost` and `GET /menu-items/:id/margin`, validates the data-fetching pattern)
- **2 Storybook stories per component**: default + Article-21 emphasis variant (AllergenBadge), `on_target` / `below_target` / `at_risk` / `unknown` states (MarginPanel).
- **Storybook published in CI** on every PR, hosted via GitHub Pages on `main`. Per ai-playbook §13.
- **One end-to-end journey screen wired**: J3 (Owner mobile dashboard) loads a list of MenuItems, fetches each one's margin via API, renders a `MarginPanel` per row. NOT the canonical M2 dashboard (#9 `m2-owner-dashboard` ships that), but the proof-of-concept screen that closes the API → React loop end-to-end.
- **Slicing artefact updated** — `docs/openspec-slice-module-2.md` gains row #12 `m2-ui-foundation` and row #13 `m2-ui-backfill-wave1` (sibling, scope deferred to its own proposal).

## Capabilities

### New Capabilities

- `m2-ui-foundation`: web app shell + ui-kit + Storybook + first 2 components + 1 journey screen as proof of contract.

### Modified Capabilities

(none — purely additive to the M2 surface area.)

## Impact

- **Prerequisites**: `m2-data-model` (DESIGN.md tokens reference colour roles already in design), `m2-cost-rollup-and-audit` (#3, MarginPanel consumes its endpoint), `m2-menus-margins` (#8, MarginPanel consumes its endpoint), `m2-allergens-article-21` (#7, AllergenBadge consumes its endpoint). All four are merged.
- **Code**: new `apps/web/`, expanded `packages/ui-kit/`, root-level `package.json` workspaces extended, root `tsconfig.base.json`, GitHub Actions workflow for Storybook deploy.
- **Backend impact**: NONE. No changes to `apps/api/`. CORS allowance for the dev port is the only side touch (likely localhost:5173 for Vite default).
- **API surface**: NONE added; this slice consumes existing endpoints from #3, #7, #8.
- **Performance**: Owner dashboard mobile screen <1s on slow Wi-Fi (PRD M2 §NFR Performance). Storybook static build size targets bundle ≤500KB gzipped at v0.
- **Out of scope**:
  - The remaining 11 components from `docs/ux/components.md` (split across `m2-ui-backfill-wave1` and the 5 unshipped M2 slices)
  - Authentication / login flow (defer until backend has a real auth service per `User.password_hash` placeholder removed by PR #76's bcrypt switch — auth wiring is its own slice)
  - i18n runtime (locale files exist; runtime switching is a separate concern)
  - E2E (Playwright) tests — defer to per-journey slices that own their journey screens
- **BREAKING** (none.)
