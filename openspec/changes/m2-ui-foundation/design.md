## Context

ai-playbook §13 of the UX Track spec mandates Storybook-first development inside the slice that owns each component, with `packages/ui-kit/` as the canonical promotion target. This consumer's `apps/api/` exists; `apps/web/` does not; `packages/ui-kit/` is a stub. Without this slice, the remaining M2 slices either keep deferring (the trap we already fell into 4 times) or each one spends ~30 % of its budget bootstrapping its own bit of UI infra. Centralising the bootstrap once is cheaper.

ADR-019 (label rendering via `@react-pdf/renderer`) already locks **React + Storybook + shadcn-ish components**. ADR-013 (Agent-Ready Foundation) requires the API to remain the contract — the UI is one consumer among many. ADR-016 (margin status thresholds + WCAG-AA) demands visible status colour paired with a text label per allergen / margin row. `docs/ux/DESIGN.md` v0 is OKLCH-canonical (per ai-playbook §10).

## Goals / Non-Goals

**Goals:**

- Bootstrap `apps/web/` (Vite + React 18 + TanStack Query + React Router 6) and `packages/ui-kit/` (Tailwind 4 + shadcn primitives + Storybook 8).
- Surface `docs/ux/DESIGN.md`'s OKLCH tokens at runtime as CSS variables; consume them via Tailwind 4's `@theme` block.
- Ship 2 components that prove the chain end-to-end: `AllergenBadge` (regulatory-significant) and `MarginPanel` (data-fetching).
- Ship 1 journey screen (J3 Owner mobile) that fetches real backend data and renders the components — NOT the canonical M2 owner dashboard, just the proof-of-concept that closes the loop.
- Storybook published in CI on every PR (per ai-playbook §13).
- Establish the per-component file-layout convention so future slices don't reinvent it.

**Non-Goals:**

- The other 11 components from `docs/ux/components.md` — split between `m2-ui-backfill-wave1` (the 5 retroactive ones) and the 5 unshipped M2 slices that own them.
- Authentication / login flow — depends on a real auth service the backend doesn't have yet.
- Server-side rendering / hydration — not needed for a tablet kitchen + mobile owner UI; adds Next.js complexity for negative leverage at this scale.
- i18n runtime switching — locale files exist, runtime switching is a separate slice.
- E2E (Playwright) tests on journey screens — deferred to slices that own their canonical screens (the J3 screen here is a proof-of-concept, not a deliverable journey).
- A Vue / Svelte alternative — React is locked by ADR-019.

## Decisions

### Decision 1: Vite + React over Next.js

**Decision**: `apps/web/` is a Vite + React 18 SPA, not a Next.js app.

**Rationale**:

- ADR-013 makes the API the contract. SSR adds complexity (server runtime, hydration mismatches, double-rendering) for negligible benefit when all consumers (UI, MCP server, hypothetical mobile native app) hit the same REST endpoints.
- Vite's dev-server cold-start is sub-second; HMR is the M2 chef + owner experience the kitchen-tablet UX needs.
- No SEO requirement — these are private kitchen / management surfaces, not marketing pages.
- One less framework to vendor-lock; Vite's `tsup`-backed builds are stable and small.

**Alternatives considered**:

- **Next.js 15 App Router**: pro = SSR, file-based routing, image optimisation. Con = SSR not needed (private surfaces), App Router learning curve adds slice cost, image optimisation is overkill for our 2-3 SVG icons. Rejected.
- **Remix / TanStack Start**: similar to Next.js with worse Storybook integration. Rejected.
- **Astro with React islands**: misaligned with our "rich interactive surfaces" pattern (every kitchen surface is interactive, not content-heavy). Rejected.

### Decision 2: Tailwind 4 with `@theme` over Tailwind 3 with config file

**Decision**: Tailwind 4 with the `@theme { ... }` block in `packages/ui-kit/src/tokens.css`, generated from `docs/ux/DESIGN.md` YAML frontmatter.

**Rationale**:

- Tailwind 4's CSS-first config maps cleanly onto our DESIGN.md → CSS variable pipeline. No `tailwind.config.js` to maintain in sync with DESIGN.md.
- OKLCH support is first-class in Tailwind 4 (`bg-(--accent)` syntax preserves the OKLCH form).
- Tailwind 3's `theme.json` export from `npx @google/design.md` works, but adds a generation step; Tailwind 4 reads CSS variables directly.

**Alternatives considered**:

- **Tailwind 3** with a generated `theme.json`: works, but adds a build-time export step + version drift between DESIGN.md and tailwind config. Rejected.
- **Vanilla extract / Stitches / Emotion**: zero-runtime CSS-in-JS. Out of scope for a slice this small; shadcn/ui ships Tailwind, swapping the styling layer would force re-implementation.

### Decision 3: shadcn/ui as base layer, NOT a hard dependency

**Decision**: Copy shadcn primitives (`Button`, `Card`, `Badge`, `Dialog`, etc.) into `packages/ui-kit/src/primitives/` rather than installing `@shadcn/ui` as a runtime dep.

**Rationale**:

- shadcn's design philosophy is "copy + own" — the components live in our repo, are version-controlled, and customised in place to match `DESIGN.md`. ai-playbook §13 endorses this pattern explicitly.
- No transitive Radix UI version conflicts to manage in `package.json`.
- We can edit a primitive (e.g., extend `Badge` with the Article-21 emphasis variant) without forking an upstream package.

**Alternatives considered**:

- **Radix UI directly**: pro = headless, lower-level. Con = doubles the work for every component (compose Radix + style + accessibility); shadcn already did the composition. Rejected.
- **Material UI / Ant Design**: too opinionated; clashes with the DESIGN.md token language. Rejected.

### Decision 4: TanStack Query for data-fetching

**Decision**: Use `@tanstack/react-query` v5 for all REST calls to `apps/api/`.

**Rationale**:

- Live cost / margin / allergen reads benefit from cache + revalidation semantics (the chef expects sub-200ms updates per NFR Performance — TanStack Query's stale-while-revalidate is the right shape).
- Mutation handling is uniform (override-flow on Manager actions like `PUT /recipes/:id/lines/:lineId/source` returns updated entity → cache invalidates).
- Devtools is excellent for debugging the kitchen-tablet → API loop.

**Alternatives considered**:

- **SWR**: simpler API but weaker on mutations + cache invalidation. Rejected.
- **Hand-rolled `fetch` + `useReducer`**: re-implements TanStack Query badly; runs into stale-cache bugs under load. Rejected.
- **RTK Query**: locked into Redux Toolkit; Redux is overkill for our state shape. Rejected.

### Decision 5: 1 monorepo root, no app-level package-lock fragmentation

**Decision**: `apps/web/`'s deps install at the root via npm workspaces (which already host `apps/api/` and `packages/types/`).

**Rationale**:

- One `package-lock.json` ensures Vite + Storybook + Tailwind versions stay consistent across the kit and the app.
- Hoisting works (verified in M2 with `@nestjs/event-emitter` migration); npm 10 handles monorepo HOIST correctly.
- Cuts CI install time on PRs that touch UI code (one `npm install` step, not two).

### Decision 6: Storybook published via GitHub Pages, gated by CI

**Decision**: A new `.github/workflows/storybook.yml` builds Storybook on every PR (advisory), publishes to GitHub Pages on push to `main`. URL stable at `https://wizarck.github.io/openTrattOS/storybook/`.

**Rationale**:

- ai-playbook §13: *"Storybook is published in CI for static review on every PR."*
- Designers + reviewers need a stable URL to inspect components without checking out the branch.
- GitHub Pages is free, auto-versioned per commit, and has a 1-line action.

### Decision 7: Component file-layout

**Decision**: One folder per component under `packages/ui-kit/src/components/<ComponentName>/`:

```
packages/ui-kit/src/components/AllergenBadge/
├── AllergenBadge.tsx           # the component
├── AllergenBadge.stories.tsx   # Storybook stories (≥3 states)
├── AllergenBadge.test.tsx      # unit tests (Testing Library + Vitest)
├── AllergenBadge.types.ts      # public types (re-exported from index.ts)
└── index.ts                    # barrel
```

**Rationale**:

- One folder = one cognitive unit. Reviewers see the contract + impl + stories + tests in one ls.
- Future slices can scaffold from `templates/component.tsx.template` (filed as a follow-up; not in this slice's scope).
- Symmetric to the per-BC folder shape backend uses (`apps/api/src/<bc>/{domain,application,interface}/`).

## Risks / Trade-offs

- **[Risk] Tailwind 4 is in beta** as of 2026-05-05. Major breaking changes possible before stable. **Mitigation**: pin to a specific 4.x version in `package.json`; track Tailwind 4 GA in a follow-up retro entry; document the migration path in `packages/ui-kit/README.md`.
- **[Risk] Vite + Storybook integration has historical pain points** (HMR conflicts, manager-builder mismatches). **Mitigation**: use Storybook 8's official `@storybook/react-vite` framework; pin Storybook 8.4+ where the integration is stable.
- **[Risk] OKLCH support in older browsers** — Safari 16.3- doesn't ship OKLCH. **Mitigation**: ai-playbook §10 explicitly covers this — emit hex computed equivalents alongside in `DESIGN.md` YAML frontmatter; runtime CSS uses OKLCH as primary, hex via `@supports not (color: oklch(...))` fallback for the long tail. Browser baseline target is per `architecture-decisions.md` (currently iOS Safari 17+, Chrome 120+ — both have OKLCH).
- **[Risk] The 4 retroactive components (`m2-ui-backfill-wave1`) might re-discover backend gaps that complicate this slice's "stable contracts" assumption.** **Mitigation**: ship the 2 components in this slice that touch the highest-information endpoints (cost + margin + allergens); if a contract gap surfaces in `m2-ui-backfill-wave1`, fix it in that slice with a backend hotfix.
- **[Trade-off] Shipping only 2 components leaves the kit feeling empty.** Acceptable: the SHELL is the deliverable; components are the proof-of-life. Backfill happens immediately after.
- **[Trade-off] J3 dashboard screen here is a proof-of-concept, not the canonical owner dashboard.** Acceptable: `m2-owner-dashboard` (#9) ships the real one. This screen exists to verify the chain. Mark it `dev-only` in code + remove or refactor when #9 lands.

## Migration Plan

Steps:

1. Bootstrap `apps/web/` with Vite (`npm create vite@latest`) — React + TypeScript template. Add to root `workspaces`. Set up React Router 6 + TanStack Query 5.
2. Bootstrap `packages/ui-kit/` — Tailwind 4 with `@theme` block. Copy shadcn `Button`, `Badge`, `Card`, `Dialog` primitives. Set up Storybook 8 with `@storybook/react-vite` framework.
3. Generate `packages/ui-kit/src/tokens.css` from `docs/ux/DESIGN.md` YAML frontmatter — emit OKLCH-canonical CSS variables. Tokens.css is the single import boundary; both apps/web/ and Storybook import it.
4. Implement `AllergenBadge` (icon + text + Article-21 emphasis variant). 3 Storybook stories (default, allergen-list-of-3, Article-21-emphasis).
5. Implement `MarginPanel` (cost / sellingPrice / margin% / vs target with status colour). 5 Storybook stories (`on_target` / `below_target` / `at_risk` / `unknown` / `loading`).
6. Wire one J3 proof-of-concept screen (`apps/web/src/screens/OwnerDashboardPocScreen.tsx`) — TanStack Query call to `GET /menu-items?organizationId=…&isActive=true`, then `GET /menu-items/:id/margin` per row, render `<MarginPanel/>` per result. NOT canonical M2 dashboard.
7. CI: `.github/workflows/storybook.yml` builds Storybook + uploads as Pages artifact on every PR (advisory); deploys to GitHub Pages on push to `main`.
8. Update `docs/openspec-slice-module-2.md` — add row #12 (`m2-ui-foundation`) and row #13 (`m2-ui-backfill-wave1` filed as sibling, scope deferred).
9. Update `docs/openspec-slice-module-2.md`'s "Track structure" section to note that the 5 remaining backend slices each ship their own UI components per ai-playbook §13.

**Rollback**: revert. No backend changes; no DB changes; new directories drop cleanly.

**Backwards compatibility**: there is no current frontend, so no compat surface to preserve.

## Open Questions

- **Q1: Tailwind 4 vs Tailwind 3?** The proposal locks Tailwind 4 (Decision 2). If Tailwind 4 isn't yet stable enough for production at slice start (ts-check or the pinned version exhibits bugs), fall back to Tailwind 3 + a generated `theme.json` from `npx @google/design.md export --format tailwind`. Document the fallback in this slice's retro.
- **Q2: Should `packages/label-renderer/` (per ADR-019) bootstrap in this slice?** Probably not — `m2-labels-rendering` (#10) owns it, and label PDFs need their own React-PDF-specific Storybook story format. Defer to #10. ❓ CLARIFICATION NEEDED if Master wants the renderer alongside ui-kit.
- **Q3: GitHub Pages deploy on every PR (preview URLs) or only on `main`?** Pages doesn't support per-PR previews natively; if Master wants per-PR previews, swap to Chromatic / Vercel preview deploys. Default: Pages on `main` only, per-PR builds advisory (artifact uploaded but not deployed). ❓ CLARIFICATION NEEDED if previews-per-PR are required.
