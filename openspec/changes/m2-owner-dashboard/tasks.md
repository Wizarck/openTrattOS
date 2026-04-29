## 1. DashboardService

- [ ] 1.1 `getTopBottomMenuItems(orgId, window, direction, n=5)` — queries margins from `#8`, sorts, returns top or bottom slice
- [ ] 1.2 Empty-state handling: org with <5 MenuItems returns available with metadata flag
- [ ] 1.3 60s in-memory cache keyed `(orgId, window, direction)` with invalidation on `SupplierItem.priceUpdated` event

## 2. Endpoints

- [ ] 2.1 `GET /dashboard/menu-items?window=7d&direction=top|bottom` — Owner + Manager only; default window 7d, default direction "top"
- [ ] 2.2 `GET /menu-items/:id/cost-history?window=14d` — wraps `#3`'s cost-history with MenuItem context (sellingPrice + targetMargin)
- [ ] 2.3 `GET /recipes/:id/staff-view` — read-only Recipe payload subset; available to all roles
- [ ] 2.4 RBAC: dashboard endpoints reject Staff with 403; staff-view available to all

## 3. UI: MenuItemRanker + dashboard page

- [ ] 3.1 `packages/ui-kit/src/menu-item-ranker/` — mobile-first card list; swipeable on mobile; side-by-side top/bottom on tablet+
- [ ] 3.2 Per-card content: recipe name, location, channel, margin %, status colour + text label
- [ ] 3.3 Tap-to-drill-down: navigates to `/menu-items/:id` for full cost-history view
- [ ] 3.4 Empty-state copy: "Add MenuItems to see full ranking"
- [ ] 3.5 Storybook: mobile / tablet / desktop / empty-state / loading / error states
- [ ] 3.6 ARIA: cards labelled with margin status; status colour + text always paired

## 4. Performance

- [ ] 4.1 Image + asset optimisation for mobile (no large hero images on dashboard)
- [ ] 4.2 Code-split: dashboard route loads its own bundle; not in main entry
- [ ] 4.3 Slow-Wi-Fi simulation: Lighthouse / DevTools 3G throttle < 1s FMP
- [ ] 4.4 Cache hit-rate metric: log cache hits/misses per dashboard query

## 5. Tests

- [ ] 5.1 Unit: cache hit within 60s; expiry after 60s
- [ ] 5.2 Unit: cache invalidation on SupplierItem.priceUpdated
- [ ] 5.3 E2E: Owner sees top-5 ranking; Manager sees same; Staff blocked on dashboard
- [ ] 5.4 E2E: Staff can use `/recipes/:id/staff-view`; sees ingredient list + allergens but not cost
- [ ] 5.5 E2E: Empty state when org has <5 MenuItems
- [ ] 5.6 E2E: Drill-down from dashboard navigates correctly + bypasses cache
- [ ] 5.7 Performance E2E: Lighthouse score 90+ on mobile slow-Wi-Fi profile

## 6. Verification

- [ ] 6.1 Run `openspec validate m2-owner-dashboard` — must pass
- [ ] 6.2 Manual smoke: Journey 3 walkthrough on a real phone (not just dev tools)
- [ ] 6.3 Confirm staff-view does not leak cost / margin / audit data
