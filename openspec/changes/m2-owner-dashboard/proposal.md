## Why

Journey 3 (Owner reads "which dishes lost money this week" on Sunday night) is the killer-app for the Owner persona — Roberto opens his phone on the sofa and sees the top/bottom-5 ranking + drill-down per MenuItem. Without this slice, M2's Owner value-proposition is invisible. The slice is read-only and mobile-first: it's the lightest UI surface but the most user-visible deliverable.

## What Changes

- Owner-facing dashboard endpoints (FR33, FR38–40) + UI for Journey 3.
- Top/bottom-5 MenuItem ranking by margin across all Locations and Channels for a configurable window (default 7d) (FR33 + FR38).
- Drill-down from any MenuItem to the recipe cost-history + per-component delta wired into #3's "what changed?" view (FR39).
- Staff (read-only) view of any Recipe's ingredient list / allergens / diet flags / finished-portion macros (FR40).
- `MenuItemRanker` UI component (per `docs/ux/components.md`), mobile-first per Journey 3.
- Performance contract: page load <1s on slow Wi-Fi per NFR (Roberto on his sofa, Sunday night, possibly slow connection).
- RBAC: Owner sees the full ranking + drill-downs; Manager sees the same; Staff only sees the read-only Recipe/macro view (FR40).
- **BREAKING** (none.)

## Capabilities

### New Capabilities

- `m2-owner-dashboard`: top/bottom MenuItem ranking + drill-down to cost-history + Staff read-only Recipe view.

### Modified Capabilities

(none.)

## Impact

- **Prerequisites**: `#8 m2-menus-margins` (margin data source).
- **Code**: `apps/api/src/dashboard/` (read-only endpoints), `apps/web/src/owner-dashboard/` (mobile-first page), `packages/ui-kit/src/menu-item-ranker/`.
- **API surface**: `GET /dashboard/menu-items?window=7d&direction=top|bottom`, `GET /menu-items/:id/cost-history`, `GET /recipes/:id/staff-view`.
- **UX**: mobile-first per Journey 3 (Roberto on phone). Tablet + desktop fallback acceptable but not the primary target.
- **Out of scope**: anything Manager/Owner-write-side; this is purely the read view.
- **Performance**: <1s slow-Wi-Fi load (cached cost summary, lazy drill-down).
