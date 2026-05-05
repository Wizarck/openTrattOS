## 1. DashboardService

- [ ] 1.1 `getTopBottomMenuItems(orgId, window, direction, n=5)` — queries margins from `#8`, sorts, returns top or bottom slice
- [ ] 1.2 Empty-state handling: org with <5 MenuItems returns available with metadata flag
- [ ] 1.3 60s in-memory cache keyed `(orgId, window, direction)` with invalidation on `SupplierItem.priceUpdated` event

## 2. Endpoints

- [ ] 2.1 `GET /dashboard/menu-items?window=7d&direction=top|bottom` — Owner + Manager only; default window 7d, default direction "top"
- [ ] 2.2 `GET /menu-items/:id/cost-history?window=14d` — wraps `#3`'s cost-history with MenuItem context (sellingPrice + targetMargin)
- [ ] 2.3 `GET /recipes/:id/staff-view` — read-only Recipe payload subset; available to all roles
- [ ] 2.4 RBAC: dashboard endpoints reject Staff with 403; staff-view available to all

## 3. UI: MenuItemRanker (packages/ui-kit) + canonical dashboard route (apps/web)

Per the per-component file layout locked by `#12`:

- [ ] 3.1 `packages/ui-kit/src/components/MenuItemRanker/MenuItemRanker.types.ts` — hand-mirrored DashboardMenuItem DTO + props
- [ ] 3.2 `MenuItemRanker.tsx` — mobile-first card list; stacked at < 768 px, two-column at ≥ 768 px (Top / Bottom side-by-side); each card uses `<MarginPanel>` from `#12`
- [ ] 3.3 Per-card content: recipe name, location, channel, margin %, status colour + text label (delegate the status visual to MarginPanel — DRY)
- [ ] 3.4 Tap-to-drill-down: per Open Question 1 — defer to Master decision (route, inline expand, or omit)
- [ ] 3.5 Empty-state copy: "Add MenuItems to see ranking"
- [ ] 3.6 `MenuItemRanker.stories.tsx` — Default / Mobile / Tablet / Empty / Loading / TopOnly / BottomOnly
- [ ] 3.7 `MenuItemRanker.test.tsx` — ≥10 tests: top + bottom render, sorting order, status colour-paired-with-text, mobile vs tablet layout, empty state, loading state, ARIA card labels, drill-down callback fires
- [ ] 3.8 `index.ts` re-exports
- [ ] 3.9 `apps/web/src/hooks/useDashboardMenuItems.ts` — TanStack Query for `GET /dashboard/menu-items`
- [ ] 3.10 `apps/web/src/screens/OwnerDashboardScreen.tsx` — canonical screen; mobile-first; mounts `<MenuItemRanker>`
- [ ] 3.11 Add route `/owner-dashboard` in `apps/web/src/main.tsx`; **delete** `/poc/owner-dashboard` route + delete `apps/web/src/screens/OwnerDashboardPocScreen.tsx`

## 4. Performance

- [ ] 4.1 Code-split: dashboard route loads its own chunk via `React.lazy`
- [ ] 4.2 Synthetic perf test (in-process, mirrors `#8`'s pattern): 200 MenuItems, p95 < 200 ms for `getTopBottomMenuItems`
- [ ] 4.3 Cache hit-rate logging: log cache hits/misses per dashboard query (debug level)

## 5. Tests

- [ ] 5.1 Unit: cache hit within 60s; expiry after 60s
- [ ] 5.2 Unit: cache invalidation on `SUPPLIER_PRICE_UPDATED` event (existing event from `#3`)
- [ ] 5.3 Unit: Owner + Manager succeed on `/dashboard/menu-items`; Staff returns 403 (controller test mocking RBAC guard)
- [ ] 5.4 Unit: Staff can use `/recipes/:id/staff-view`; payload omits cost / margin / audit fields
- [ ] 5.5 Unit: Empty state — org with 3 MenuItems returns 3 entries with metadata flag
- [ ] 5.6 Integration spec (Postgres, Docker-deferred): full flow Owner → dashboard → 3 MenuItems → drill-down to one
- [ ] 5.7 Smoke test (apps/web Vitest): mounts `<OwnerDashboardScreen>` against a TanStack Query mock; verifies top + bottom lists render

## 6. Verification

- [ ] 6.1 Run `openspec validate m2-owner-dashboard` — must pass
- [ ] 6.2 Manual smoke: open `/owner-dashboard?organizationId=<id>` against a running `apps/api/`; verify top + bottom render
- [ ] 6.3 Confirm staff-view does not leak cost / margin / audit data
- [ ] 6.4 `npm run build --workspace=apps/web` — bundle size still <300 KB gzipped
- [ ] 6.5 `npm run build-storybook --workspace=packages/ui-kit` — 8 components total in static output
