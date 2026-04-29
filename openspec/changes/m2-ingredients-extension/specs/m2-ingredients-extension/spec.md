## ADDED Requirements

### Requirement: Search Ingredients by name, brand, or barcode against OFF mirror

The system SHALL expose a search endpoint that resolves Ingredient candidates from the local OFF mirror first, falling through to the OFF REST API on cache miss.

#### Scenario: Search by name returns mirror hits
- **WHEN** a Manager queries `GET /ingredients/search?q=tomate`
- **THEN** the system returns the top-N matches from `external_food_catalog` ranked by name + brand match score, in <500ms p95

#### Scenario: Search by barcode resolves directly
- **WHEN** a Manager queries `GET /ingredients/search?barcode=8410173005111`
- **THEN** the system returns the matching catalog row (cache hit) in <50ms p50

#### Scenario: Cache miss falls through to OFF API
- **WHEN** the barcode is not in the local mirror
- **THEN** the system queries the OFF API; on success, persists to mirror and returns; subsequent identical queries hit cache

### Requirement: Ingredient creation pre-fills from OFF match

The system SHALL pre-fill `nutrition`, `allergens`, `dietFlags`, `brandName`, and `externalSourceRef` when a chef creates an Ingredient from an OFF match.

#### Scenario: Create from OFF match populates extended fields
- **WHEN** a Manager creates an Ingredient by selecting an OFF search result
- **THEN** the persisted Ingredient row carries the OFF macros / allergens / dietFlags / brandName + `externalSourceRef = <OFF code>`

#### Scenario: Manual create leaves extended fields empty
- **WHEN** a Manager creates an Ingredient without an OFF match
- **THEN** `nutrition` is null, `allergens` is empty array, `dietFlags` is empty array, `externalSourceRef` is null

### Requirement: Manager can override any OFF-pulled field with attribution and reason

The system SHALL allow Manager+ users to override `nutrition`, `allergens`, `dietFlags`, or `brandName` with attribution + reason captured in `audit_log`.

#### Scenario: Override an allergen list
- **WHEN** a Manager updates an Ingredient's `allergens` field with a `reason` string
- **THEN** the new value persists, an `audit_log` row is written with `userId`, `field=allergens`, `oldValue`, `newValue`, `reason`, `at=<timestamp>`

#### Scenario: Override without reason is rejected
- **WHEN** a Manager attempts to override an OFF-pulled field without a `reason`
- **THEN** the system returns 422 with `{code: "REASON_REQUIRED", field}`

#### Scenario: Staff cannot override
- **WHEN** a Staff user attempts an override
- **THEN** the system returns 403 Forbidden

### Requirement: Recipe macro rollup computes per-portion and per-100g at read time

The system SHALL expose `GET /recipes/:id/macros` returning kcal + macros per finished portion AND per 100g, computed by walking the Recipe tree summing `nutrition × quantity × yield × (1 − waste)` per component.

#### Scenario: Per-portion and per-100g views both returned
- **WHEN** a user requests `GET /recipes/:id/macros`
- **THEN** the response includes `{perPortion: {kcal, proteinG, carbG, fatG}, per100g: {kcal, proteinG, carbG, fatG}}`

#### Scenario: Macros recompute when an Ingredient nutrition changes
- **WHEN** an Ingredient referenced by a Recipe has its `nutrition` updated
- **THEN** the next `GET /recipes/:id/macros` call returns the updated rollup (no caching staleness)

#### Scenario: Sub-recipe nutrition rolls up correctly
- **WHEN** a Recipe contains a sub-recipe component
- **THEN** the macro rollup walks recursively, applying each level's yield + waste factors per component

### Requirement: ODbL attribution renders on UI components consuming OFF data

The system SHALL render the `licenseAttribution` string on every UI surface that displays OFF-pulled data, per ODbL terms inherited from `#4`.

#### Scenario: IngredientPicker shows attribution
- **WHEN** the IngredientPicker displays OFF-derived search results
- **THEN** an attribution line referencing Open Food Facts (ODbL) is visible alongside the results

#### Scenario: MacroPanel shows attribution when sourced from OFF
- **WHEN** the MacroPanel renders nutrition for an Ingredient with `externalSourceRef` set
- **THEN** the panel displays the attribution line

## MODIFIED Requirements

### Requirement: Ingredient exposes nutrition, allergens, dietFlags, and brand fields

The Ingredient entity SHALL expose `nutrition` (jsonb), `allergens` (text[]), `dietFlags` (text[]), `brandName` (string nullable), and `externalSourceRef` (string nullable) on every read response. M1 read endpoints are extended additively; existing fields and behaviour preserved.

#### Scenario: GET /ingredients/:id returns extended fields
- **WHEN** a user fetches an Ingredient created in M1 (no OFF data)
- **THEN** the response includes the new fields with null/empty defaults; M1 fields are unchanged

#### Scenario: GET /ingredients/:id returns OFF-pulled values
- **WHEN** a user fetches an Ingredient created from an OFF match
- **THEN** the response includes the OFF-pulled `nutrition`, `allergens`, `dietFlags`, `brandName`, and `externalSourceRef`
