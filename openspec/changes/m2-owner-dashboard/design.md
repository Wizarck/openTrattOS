## Context

Journey 3 (Owner Sunday-night dashboard) is M2's killer-app for the Owner persona — Roberto opens his phone on the sofa and sees top/bottom-5 MenuItems by margin with one-tap drill-down. The slice is read-only and **mobile-first**: smallest UI surface but highest-visibility deliverable. Foundation: `#8 m2-menus-margins` provides the margin computation; `#3 m2-cost-rollup-and-audit` provides the drill-down history.

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
3. UI: `MenuItemRanker` component in `packages/ui-kit/`; mobile-first layout; drill-down navigates to `/menu-items/:id`.
4. Cache layer: in-memory cache with 60s TTL keyed on `(orgId, window)` — single Redis or in-process Map (M2 single-tenant scale is fine with in-process).
5. Performance test: load with 200 MenuItems, ensure p95 <1s.

Rollback: revert; `#8` remains; UI dashboard page can be feature-flagged off if needed.

## Open Questions

(none.)
