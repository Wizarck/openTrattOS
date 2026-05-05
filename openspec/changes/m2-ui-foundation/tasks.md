## 1. apps/web/ shell bootstrap

- [x] 1.1 Scaffold `apps/web/` with `npm create vite@latest` — React + TypeScript template; add to root `package.json` `workspaces` array.
- [x] 1.2 Install React Router 6 (`react-router-dom@^6`) + TanStack Query 5 (`@tanstack/react-query@^5`) + their TypeScript types.
- [x] 1.3 Add `<QueryClientProvider />` + `<RouterProvider />` shell at `apps/web/src/main.tsx`.
- [x] 1.4 Create `apps/web/src/App.tsx` with one route `/poc/owner-dashboard` mounting the J3 proof-of-concept screen (built in §5).
- [x] 1.5 Configure Vite proxy to forward `/api/*` to `http://localhost:3000` (NestJS default) so the dev experience is single-origin without CORS friction.
- [x] 1.6 Add `vite-tsconfig-paths` for monorepo path resolution (`@opentrattos/ui-kit/*`).
- [x] 1.7 Add `apps/web/.env.example` with `VITE_API_URL=http://localhost:3000`; document in `apps/web/README.md`.

## 2. packages/ui-kit/ setup

- [x] 2.1 Add `tailwindcss@^4` + `@tailwindcss/vite` to `packages/ui-kit/package.json` and to `apps/web/package.json` as a peer.
- [x] 2.2 Create `packages/ui-kit/src/tokens.css` — OKLCH `:root { ... }` block derived from `docs/ux/DESIGN.md` YAML frontmatter. Single import boundary; both `apps/web/` and Storybook import it.
- [x] 2.3 Add `@theme` block in `packages/ui-kit/src/tokens.css` mapping CSS variables to Tailwind theme tokens (e.g., `--color-bg`, `--color-accent`, `--font-sans`, `--spacing-1`).
- [ ] 2.4 [DEFERRED to m2-ui-backfill-wave1] Copy shadcn primitives `Button`, `Badge`, `Card`, `Dialog` from upstream into `packages/ui-kit/src/primitives/<Name>/`. Each primitive carries its own folder per the §7 layout convention.
- [ ] 2.5 [DEFERRED to m2-ui-backfill-wave1] Adapt each primitive's default styling to consume DESIGN.md tokens (replace shadcn's `bg-primary` etc. with `bg-(--color-accent)` references). Do not introduce hex colours anywhere.
- [ ] 2.6 [DEFERRED to m2-ui-backfill-wave1] Configure `packages/ui-kit/vite.config.ts` for library build (`build.lib`). Not needed in v0 because in-monorepo consumers (`apps/web/`) import directly from `src/index.ts` via the tsconfig path alias.
- [x] 2.7 Configure tsconfig path alias `@opentrattos/ui-kit/*` → `packages/ui-kit/src/*` at the root `tsconfig.base.json`.

## 3. Storybook bootstrap

- [x] 3.1 Install Storybook 8 with `@storybook/react-vite` framework: `npx storybook@latest init --type react`.
- [x] 3.2 Configure `packages/ui-kit/.storybook/main.ts` to consume `tokens.css` via the `staticDirs` or preview imports path — Storybook MUST render with the same OKLCH tokens as `apps/web/`.
- [x] 3.3 Configure `packages/ui-kit/.storybook/preview.ts` — global decorators for `prefers-color-scheme`, viewport sizes (tablet 1024×768, mobile 390×844), `aria-live` region attached so accessibility addon picks up announcements.
- [x] 3.4 Add Storybook addons: `@storybook/addon-a11y`, `@storybook/addon-viewport`, `@storybook/addon-interactions`. Rendering pipeline must report ≥1 a11y violation as build-warn (not build-fail at v0).
- [x] 3.5 Add `npm run storybook` (dev) and `npm run build-storybook` (static) to `packages/ui-kit/package.json`.

## 4. AllergenBadge component

- [x] 4.1 `packages/ui-kit/src/components/AllergenBadge/AllergenBadge.tsx` — props `{ allergen: string; emphasised?: boolean; "aria-label"?: string }`. Renders icon + bold text per ADR-017. Article-21 emphasis variant adds bolder weight + higher-contrast bg.
- [x] 4.2 Icon + text always; never colour-only (NFR Accessibility). Icons sourced from `lucide-react` cherry-picked (no full-bundle import).
- [x] 4.3 `AllergenBadge.stories.tsx` — 3 stories: `Default`, `ListOfThree`, `Article21Emphasis`.
- [x] 4.4 `AllergenBadge.test.tsx` (Vitest + Testing Library) — renders allergen name + icon + accessible name; emphasised variant has bolder weight; deuteranopia simulation passes (no colour-only differentiation).
- [x] 4.5 Public type export at `packages/ui-kit/src/components/AllergenBadge/index.ts`. Re-export from `packages/ui-kit/src/index.ts`.

## 5. MarginPanel component

- [x] 5.1 `packages/ui-kit/src/components/MarginPanel/MarginPanel.tsx` — props match the `MarginReportDto` shape from `apps/api/src/menus/interface/dto/menu-item.dto.ts` (cost, sellingPrice, marginAbsolute, marginPercent, marginVsTargetPp, status, statusLabel, warnings, currency). Status colour from CSS variables; statusLabel always rendered alongside per ADR-016.
- [x] 5.2 Loading state (`status === 'loading'` or fetch in flight) renders a skeleton; unknown state surfaces the first warning under the panel.
- [x] 5.3 Currency rendering: `Intl.NumberFormat` with `style: 'currency'`. Locale + currency from props; default `en-EU` + `EUR`.
- [x] 5.4 `MarginPanel.stories.tsx` — 5 stories: `OnTarget`, `BelowTarget`, `AtRisk`, `Unknown`, `Loading`.
- [x] 5.5 `MarginPanel.test.tsx` — every status renders the corresponding `statusLabel` text; unknown state renders the warning message; click on the panel does NOT dismiss the warning (warnings are persistent until backend resolves).
- [x] 5.6 Re-export from `packages/ui-kit/src/index.ts`.

## 6. J3 proof-of-concept screen

- [x] 6.1 `apps/web/src/screens/OwnerDashboardPocScreen.tsx` — mounted on `/poc/owner-dashboard`. Renders the proof-of-concept dashboard.
- [x] 6.2 TanStack Query: `useQuery` for `GET /menu-items?organizationId=<id>&isActive=true` (org id from `VITE_DEMO_ORG_ID` env or query string param). On success, render N MenuItem rows.
- [x] 6.3 Per row: nested `useQuery` for `GET /menu-items/:id/margin`. Render a `<MarginPanel/>` per row with the margin response.
- [x] 6.4 Allergen panel per row: nested `useQuery` for `GET /recipes/:id/allergens` (recipeId from MenuItem). Render a list of `<AllergenBadge/>` for each aggregated allergen.
- [x] 6.5 Mobile-first responsive layout (≤390px) per Journey 3 (Owner on sofa with phone).
- [x] 6.6 Mark the screen `dev-only` via a banner — this is NOT the canonical M2 owner dashboard (#9 ships that).
- [x] 6.7 README note in `apps/web/README.md` — POC will be removed or refactored when `m2-owner-dashboard` (#9) ships.

## 7. CI: Storybook publish

- [x] 7.1 New workflow `.github/workflows/storybook.yml` triggered on `push: branches: [master]` and `pull_request: branches: [master]`.
- [x] 7.2 PR job: `npm run build-storybook --workspace=packages/ui-kit` + upload artifact (advisory, no deploy).
- [x] 7.3 master job: same build step + deploy to GitHub Pages via `actions/deploy-pages@v4`. URL `https://wizarck.github.io/openTrattOS/storybook/`.
- [x] 7.4 Add Pages permissions to `.github/workflows/storybook.yml` (`pages: write`, `id-token: write`).
- [x] 7.5 Test: trigger workflow on this PR; verify static build artifact uploads cleanly.

## 8. Slicing update

- [x] 8.1 Edit `docs/openspec-slice-module-2.md` — add row #12 `m2-ui-foundation` to the Approved change list (this slice).
- [x] 8.2 Edit `docs/openspec-slice-module-2.md` — add row #13 `m2-ui-backfill-wave1` to the same table; mark it as "filed, scope in its own proposal" with a one-line scope note.
- [x] 8.3 Add a paragraph to `docs/openspec-slice-module-2.md` "Track structure" section noting the contract correction: each remaining M2 slice ships its own UI components + Storybook stories per ai-playbook §13. Cite the retros that documented the prior defer pattern.
- [x] 8.4 Update §3 `docs/ux/components.md` stewardship clause if the layout convention from §7 of this design.md needs to be referenced.

## 9. Tests

- [x] 9.1 Vitest unit tests for both components (≥10 cases each, per §4–5 above).
- [x] 9.2 `npm run test --workspace=packages/ui-kit` returns 0 failures.
- [x] 9.3 Storybook a11y addon reports ≤2 violations per story (warning threshold; baseline lock for v0).
- [x] 9.4 `npm run build-storybook` produces a static `storybook-static/` directory ≤500 KB gzipped (bundle-size guard).
- [x] 9.5 Lint clean: `npm run lint --workspace=apps/web` + `npm run lint --workspace=packages/ui-kit` pass.

## 10. Documentation

- [x] 10.1 `apps/web/README.md` — how to run dev (`npm run dev --workspace=apps/web`), prerequisites, env vars.
- [x] 10.2 `packages/ui-kit/README.md` — how to run Storybook, where tokens come from (DESIGN.md), the per-component file-layout convention from design.md §7.
- [x] 10.3 `docs/architecture-decisions.md` — append ADR-020 documenting the Vite + React + Tailwind 4 + Storybook 8 choice (per design.md Decisions 1, 2, 3, 4).

## 11. Verification

- [x] 11.1 `npx -y @fission-ai/openspec@latest validate m2-ui-foundation` — must pass.
- [ ] 11.2 [DEFERRED to first staging deploy] Local smoke: start `apps/api/` (`npm run dev --workspace=apps/api`), seed an Organization + Recipe + MenuItem, start `apps/web/`, navigate to `/poc/owner-dashboard?organizationId=<id>`, verify margins + allergens render.
- [x] 11.3 Storybook smoke: `npm run storybook` opens at `localhost:6006`; both components visible with all stories.
- [x] 11.4 CI: PR-only Storybook build artifact uploads; on merge to master, Pages deploy publishes to the public URL.
