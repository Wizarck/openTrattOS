## ADDED Requirements

### Requirement: Top/bottom-5 MenuItem ranking by margin

The system SHALL expose `GET /dashboard/menu-items?window=7d&direction=top|bottom` returning the 5 MenuItems with highest (or lowest) margin across all Locations and Channels in the configured window. Default window is 7 days.

#### Scenario: Owner gets top-5
- **WHEN** an Owner queries `GET /dashboard/menu-items?direction=top`
- **THEN** the response returns the 5 MenuItems with highest margin in the last 7 days, ordered descending, each entry including `{menuItemId, recipeName, locationName, channel, margin, marginPercent, status}`

#### Scenario: Owner gets bottom-5 with 14d window
- **WHEN** an Owner queries `GET /dashboard/menu-items?direction=bottom&window=14d`
- **THEN** the response returns the 5 MenuItems with lowest margin in the last 14 days

#### Scenario: Org with fewer than 5 MenuItems
- **WHEN** the org has only 3 MenuItems
- **THEN** the response returns 3 entries with no error; UI shows "Add MenuItems to see full ranking" empty-state copy

### Requirement: Drill-down to Recipe cost-history per MenuItem

The system SHALL allow drill-down from any MenuItem in the dashboard to its underlying Recipe's cost-history with per-component delta attribution.

#### Scenario: Drill-down returns cost-history
- **WHEN** an Owner clicks a MenuItem in the dashboard, triggering `GET /menu-items/:id/cost-history?window=14d`
- **THEN** the response returns the underlying Recipe's cost-history wrapped with the MenuItem's sellingPrice + targetMargin context

#### Scenario: Drill-down chains to cost-delta
- **WHEN** the user further requests `GET /menu-items/:id/cost-delta?from=&to=`
- **THEN** the response delegates to `#3`'s cost-delta endpoint, returning per-component deltas with attribution

### Requirement: Staff read-only view for Recipe

The system SHALL expose `GET /recipes/:id/staff-view` returning a read-only payload subset (ingredient list, allergens, dietFlags, finished-portion macros) for Staff role.

#### Scenario: Staff sees ingredient list + allergens
- **WHEN** a Staff user queries `GET /recipes/:id/staff-view`
- **THEN** the response includes `{ingredientList, allergens, dietFlags, finishedPortionMacros}` — no cost, no margin, no audit metadata

#### Scenario: Manager and Owner also see the staff view (read parity)
- **WHEN** a Manager or Owner queries `GET /recipes/:id/staff-view`
- **THEN** the same payload returns; Manager+ may also use `GET /recipes/:id` for full data

### Requirement: Dashboard mobile-first with <1s slow-Wi-Fi load

The dashboard UI SHALL render mobile-first per Journey 3 (Owner on phone). Page load SHALL complete in <1s on slow Wi-Fi conditions per NFR Performance.

#### Scenario: Mobile viewport renders stacked cards
- **WHEN** the dashboard is rendered at viewport width 375px
- **THEN** the top-5 and bottom-5 lists stack vertically with one card per row, swipeable

#### Scenario: Tablet viewport renders side-by-side
- **WHEN** the dashboard is rendered at viewport width 768px+
- **THEN** the top-5 and bottom-5 lists display side-by-side

#### Scenario: Slow Wi-Fi load <1s
- **WHEN** the dashboard is loaded under simulated 3G throttling
- **THEN** the page first-meaningful-paint completes in <1s; full interaction-ready in <2s

### Requirement: 60s margin cache in dashboard context, invalidated on cost change

The system SHALL cache the top/bottom-5 margin computation for 60 seconds keyed by `(orgId, window, direction)`. The cache SHALL be invalidated on `SupplierItem.priceUpdated` events affecting any of the cached MenuItems.

#### Scenario: Cache hit within 60s
- **WHEN** the same Owner queries the dashboard twice within 60 seconds
- **THEN** the second query returns the cached result without recomputing margins

#### Scenario: Cache invalidates on price change
- **WHEN** a SupplierItem price changes that affects a Recipe referenced by any cached MenuItem
- **THEN** the cache entry is invalidated; the next dashboard query recomputes

#### Scenario: Single-MenuItem drill-down bypasses cache
- **WHEN** a user clicks an item to drill down
- **THEN** the drill-down query (`/menu-items/:id/cost-history`) hits live data; no caching

### Requirement: RBAC — Owner / Manager / Staff scoped per endpoint

The system SHALL enforce the following RBAC: Owner + Manager can read the dashboard; Staff is rejected from `/dashboard/menu-items` but can use `/recipes/:id/staff-view`.

#### Scenario: Owner accesses dashboard
- **WHEN** an Owner queries `/dashboard/menu-items`
- **THEN** the system returns the ranking

#### Scenario: Staff blocked from dashboard
- **WHEN** a Staff user queries `/dashboard/menu-items`
- **THEN** the system returns 403 Forbidden

#### Scenario: Staff can use staff-view
- **WHEN** a Staff user queries `/recipes/:id/staff-view`
- **THEN** the read-only Recipe payload returns
