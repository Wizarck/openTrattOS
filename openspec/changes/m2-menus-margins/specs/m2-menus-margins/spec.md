## ADDED Requirements

### Requirement: MenuItem CRUD with composite uniqueness on Recipe × Location × Channel

The system SHALL allow Manager+ users to create, read, update, and soft-delete MenuItems. The system SHALL enforce composite uniqueness on `(organizationId, recipeId, locationId, channel)` at the database level.

#### Scenario: Manager creates a MenuItem
- **WHEN** a Manager POSTs `/menu-items` with `recipeId`, `locationId`, `channel="dine-in"`, `sellingPrice=18.50`, `targetMargin=0.65`
- **THEN** the MenuItem persists and the response includes the persisted id + computed initial margin

#### Scenario: Duplicate MenuItem rejected
- **WHEN** a Manager POSTs a MenuItem for a Recipe + Location + Channel combination that already has an active MenuItem
- **THEN** the database rejects with unique-constraint violation; the API returns 409 Conflict with `{code: "DUPLICATE_MENU_ITEM"}`

#### Scenario: Soft-delete preserves history
- **WHEN** an Owner soft-deletes a MenuItem
- **THEN** `isActive=false` is set; the row remains in the database for historical margin queries

#### Scenario: Staff cannot write
- **WHEN** a Staff user attempts POST/PUT/DELETE
- **THEN** the system returns 403 Forbidden

### Requirement: Read-time margin computation with status colour per ADR-016

The system SHALL compute MenuItem margin at read time as `sellingPrice − liveRecipeCost`, returning absolute value, percent, and status colour per ADR-016 thresholds.

#### Scenario: Margin meets target — green
- **WHEN** a MenuItem with `sellingPrice=20`, `targetMargin=0.65` has live cost 5.50 (margin 72.5%, above 65%)
- **THEN** `GET /menu-items/:id/margin` returns `{absolute, percent: 72.5, status: "green"}`

#### Scenario: Margin within 5pp below target — amber
- **WHEN** the same MenuItem has live cost rise to 7.00 (margin 65%, exactly target)
- **THEN** `status` is "green" (≥target counts as green); just below at 60% (margin 5pp under target) returns "amber"

#### Scenario: Margin >5pp below target — red
- **WHEN** the live cost rises to 9.00 (margin 55%, 10pp under target)
- **THEN** `status` returns "red"

#### Scenario: Status paired with text label
- **WHEN** a UI consumer renders the margin status
- **THEN** the consumer SHALL display both the colour AND a text label ("On target" / "Below target by Xpp" / "At risk") per NFR Accessibility

### Requirement: Margin report aggregates margin data per MenuItem

The system SHALL expose `GET /menu-items/:id/margin` returning cost, sellingPrice, margin (absolute + %), targetMargin, status, and a `lastCostUpdate` timestamp.

#### Scenario: Margin report fields complete
- **WHEN** `GET /menu-items/:id/margin` is called
- **THEN** the response includes `{cost, sellingPrice, marginAbsolute, marginPercent, targetMargin, status, lastCostUpdate}`

#### Scenario: Cost-unknown MenuItem returns warning
- **WHEN** the underlying Recipe has no resolvable cost (NO_SOURCE Ingredients per `#3` resolver fallback)
- **THEN** the response returns `{cost: null, status: "unknown", warning: "RECIPE_COST_UNAVAILABLE"}` — does not 500

### Requirement: Channel is an enum with fixed values

The system SHALL accept only `dine-in`, `delivery`, `takeaway`, `catering`, or `other` as the `channel` field on a MenuItem.

#### Scenario: Valid channel persists
- **WHEN** a Manager creates a MenuItem with `channel="delivery"`
- **THEN** the row persists

#### Scenario: Invalid channel rejected
- **WHEN** a Manager submits `channel="dine-out"` (typo)
- **THEN** the system returns 422 with `{code: "INVALID_CHANNEL", allowed: ["dine-in", "delivery", "takeaway", "catering", "other"]}`

### Requirement: MenuItem inherits Discontinued badge from soft-deleted Recipe

The system SHALL inherit the Discontinued display badge from the underlying Recipe when the Recipe is soft-deleted; the MenuItem itself remains active until explicitly soft-deleted.

#### Scenario: Recipe soft-deleted — MenuItem shows Discontinued
- **WHEN** an Owner soft-deletes a Recipe that has an active MenuItem
- **THEN** `GET /menu-items/:id` returns the MenuItem with `recipeStatus: "discontinued"` and the response payload includes `displayBadge: "Recipe discontinued"`

#### Scenario: Discontinued Recipe still shows historical margin
- **WHEN** the Recipe is soft-deleted but the MenuItem stays active
- **THEN** the margin endpoint still returns historical computation; consumers may suppress in active dashboards
