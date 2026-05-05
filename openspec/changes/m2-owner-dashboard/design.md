## Context

Journey 3 (Owner Sunday-night dashboard) is M2's killer-app for the Owner persona — Roberto opens his phone on the sofa and sees top/bottom-5 MenuItems by margin with one-tap drill-down. The slice is read-only and **mobile-first**: smallest UI surface but highest-visibility deliverable. Foundation: `#8 m2-menus-margins` provides the margin computation; `#3 m2-cost-rollup-and-audit` provides the drill-down history; `#12 m2-ui-foundation` + `#13 m2-ui-backfill-wave1` provide the apps/web shell, ui-kit, MarginPanel + AllergenBadge + 5 backfill components, and the per-component file-layout contract.

This slice **replaces** the J3 proof-of-concept screen at `/poc/owner-dashboard` (shipped by `#12` to validate the API → React → component chain) with the canonical owner dashboard at `/owner-dashboard`. The `/poc/...` route is removed from the router as part of this slice's housekeeping.

## Goals / Non-Goals

**Goals:**
- Top/bottom-5 MenuItem ranking by margin across all Locations + Channels for configurable window (default 7d) (FR33 + FR38).
- Drill-down per MenuItem to recipe cost-history + per-component delta (FR39).
- Staff (read-only) view of any Recipe's ingredient list / allergens / dietFlags / finished-portion macros (FR40).
- `MenuItemRanker` UI component, mobile-first per Journey 3.
- Page load <1s on slow Wi-Fi per NFR (Owner on phone, Sunday night, possibly slow connection).
- RBAC: Owner sees full ranking + drill-downs; Manager sees the same; Staff sees only the read-only Recipe/macro view.

**Non-Goals:**
- Anything write-side (this is purely read).
- New margin computation logic (delegate to `#8`).
- Per-Location filtering (M3+).

## Decisions

- **Window default 7d** per PRD §FR33 + §FR38. Configurable via query param `?window=14d` etc. **Rationale**: Owner's mental model is "this week"; 7d aligns with Sunday-evening review cadence.
- **Top-5 + bottom-5 only**, not pageable. **Rationale**: dashboard is glanceable; deeper analysis is a drill-down workflow per item, not pagination.
- **Mobile-first layout**: stacked cards on small screens, side-by-side on larger. **Rationale**: Roberto persona uses phone (Journey 3); tablet/desktop fallback is acceptable but not the design target.
- **Cached margin computation for 60s** in dashboard context. **Rationale**: Owner refreshes the page few times per session; 60s cache trims load on `liveRecipeCost` resolver from `#3` while keeping data fresh enough for Sunday review. Single-MenuItem drill-down still hits live (no cache).
- **Drill-down delegates to `#3`'s cost-delta endpoint** rather than reimplementing. **Rationale**: single source of truth for cost-history attribution; mobile UI is just a renderer.
- **Staff view is a separate endpoint** `GET /recipes/:id/staff-view` (read-only payload subset). **Rationale**: explicit endpoint for an explicit RBAC scope; avoids permission magic on the main `/recipes/:id`.

## Risks / Trade-offs

- [Risk] Mobile-first design hurts desktop/tablet experience. **Mitigation**: responsive breakpoints; the same data, different layout. Storybook covers mobile/tablet/desktop viewport states.
- [Risk] 60s cache could stale data on a price-change-and-refresh sequence. **Mitigation**: invalidate cache on SupplierItem.priceUpdated event for affected MenuItems; chef workflow remains live (no cache on individual MenuItem reads).
- [Risk] Top/bottom-5 fixed cuts dashboards for orgs with <5 MenuItems. **Mitigation**: gracefully render available items with empty-state copy ("Add MenuItems to see ranking").

## Migration Plan

Steps:
1. DashboardService aggregates: `getTopBottomMenuItems(orgId, window, n=5)` queries margins from `#8`, sorts, returns top + bottom.
2. Endpoints: `GET /dashboard/menu-items?window=7d&direction=top|bottom`, `GET /menu-items/:id/cost-history`, `GET /recipes/:id/staff-view`.
3. UI: `MenuItemRanker` ships at `packages/ui-kit/src/components/MenuItemRanker/{tsx, stories, test, types, index}` per the file-layout convention from `#12`. Mobile-first layout; drill-down navigates to `/menu-items/:id`.
4. apps/web hook `useDashboardMenuItems(orgId, window, direction)` + canonical route `/owner-dashboard` at `apps/web/src/screens/OwnerDashboardScreen.tsx`. The PoC route `/poc/owner-dashboard` is deleted from the router.
5. Cache layer: in-process Map with 60s TTL keyed on `(orgId, window, direction)` — invalidated on the existing `SUPPLIER_PRICE_UPDATED` event from `#3`.
6. Performance test: in-process synthetic test with 200 MenuItems, ensure p95 < 200 ms (matches `#8 getMargin` perf-spec pattern).

Rollback: revert; `#8` and `#12` remain. The `/owner-dashboard` route can be feature-flagged off if needed.

## Open Questions

1. **Drill-down navigation target.** Tasks §3.3 says "tap-to-drill-down navigates to `/menu-items/:id`". That route does NOT exist yet — `#13`'s J2 stub at `/poc/cost-investigation-j2` is the closest analogue. Options: (a) ship a sibling read-only `/menu-items/:id` route in this slice that mounts CostDeltaTable; (b) drill-down opens an inline expandable section on the dashboard card (no route change); (c) defer drill-down beyond the card's basic `displayLabel + status` to a follow-up slice.
2. **Mobile swipe gesture.** Existing tasks §3.1 says "swipeable on mobile". Genuine swipe (touch-action, react-spring or Embla Carousel) adds dependency weight; "stacked + scrollable" is simpler and matches Roberto's "glanceable, not interactive" mental model. Options: (a) ship genuine swipe; (b) ship stacked-scrollable.
3. **Staff-view scope.** The proposal includes `GET /recipes/:id/staff-view` as part of this slice. That's RBAC + a new payload shape, separable from the dashboard. Options: (a) keep it bundled (current scope); (b) ship the dashboard alone, file staff-view as its own micro-slice.
