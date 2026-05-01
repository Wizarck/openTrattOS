## ADDED Requirements

### Requirement: Recipe entity persists with multi-tenant isolation

The system SHALL store every Recipe scoped by `organizationId`. Cross-organisation reads or writes SHALL be rejected at the repository layer per PRD-1 §FR47.

#### Scenario: Recipe is created with organizationId
- **WHEN** a Manager creates a Recipe with name "Tagliatelle Bolognesa"
- **THEN** the persisted row has `organizationId` set to the caller's org and `createdBy` / `updatedBy` set to the caller's user id

#### Scenario: Cross-org read is rejected
- **WHEN** a user from org A queries a Recipe id belonging to org B
- **THEN** the repository returns "not found" (no leakage of cross-org existence)

### Requirement: RecipeIngredient supports sub-recipe composition

The system SHALL persist each RecipeIngredient line with exactly one of `ingredientId` or `subRecipeId` non-null, enforced by a CHECK constraint at the database layer.

#### Scenario: Line points to an Ingredient
- **WHEN** a RecipeIngredient is inserted with `ingredientId` set and `subRecipeId` null
- **THEN** the row persists and the CHECK passes

#### Scenario: Line points to a sub-Recipe
- **WHEN** a RecipeIngredient is inserted with `subRecipeId` set and `ingredientId` null
- **THEN** the row persists and the CHECK passes

#### Scenario: Line with both fields non-null is rejected
- **WHEN** a RecipeIngredient is inserted with both `ingredientId` AND `subRecipeId` non-null
- **THEN** the database rejects the insert with a CHECK constraint violation

#### Scenario: Line with neither field set is rejected
- **WHEN** a RecipeIngredient is inserted with both `ingredientId` AND `subRecipeId` null
- **THEN** the database rejects the insert with a CHECK constraint violation

### Requirement: MenuItem entity persists with multi-tenant + multi-location scope

The system SHALL persist every MenuItem with a foreign key to exactly one Recipe, exactly one Location, and exactly one Channel, all scoped under `organizationId`.

#### Scenario: MenuItem is created
- **WHEN** a Manager creates a MenuItem linking Recipe R to Location L1 with sellingPrice 18.50 and targetMargin 0.65
- **THEN** the persisted row carries `organizationId`, `recipeId=R`, `locationId=L1`, `channel`, `sellingPrice=18.50`, `targetMargin=0.65`

#### Scenario: MenuItem deletion is restricted by Recipe FK
- **WHEN** a hard-delete is attempted on a Recipe that has active MenuItems referencing it
- **THEN** the database rejects with FK constraint (RESTRICT); soft-delete via `isActive=false` is the supported path

### Requirement: Ingredient gains nutrition, allergens, dietFlags, brand provenance

The system SHALL extend the existing M1 Ingredient table with `nutrition` (jsonb), `allergens` (text[]), `dietFlags` (text[]), `brandName` (nullable string), and `externalSourceRef` (nullable string for OFF product code).

#### Scenario: Migration is additive
- **WHEN** the M2 data-model migration runs against an M1-bootstrapped database
- **THEN** all existing Ingredient rows persist unchanged; the 5 new columns default to NULL / empty array

#### Scenario: nutrition jsonb accepts OFF macro shape
- **WHEN** an Ingredient is updated with `nutrition = {"per100g": {"kcal": 250, "proteinG": 12, "carbG": 30, "fatG": 9}}`
- **THEN** the value persists and round-trips on read

### Requirement: User gains phoneNumber for future WhatsApp routing

The system SHALL add a nullable `phoneNumber` column (E.164 format) to the existing User table. No M2 feature reads or writes this column; it exists to avoid a migration during M2.x WhatsApp rollout.

#### Scenario: Migration is additive
- **WHEN** the M2 data-model migration runs
- **THEN** existing User rows persist; `phoneNumber` defaults to NULL; no service depends on it

### Requirement: Audit fields populated on every new entity

The system SHALL populate `createdBy`, `updatedBy`, `createdAt`, `updatedAt` automatically on Recipe, RecipeIngredient, and MenuItem inserts and updates per PRD-1 §FR48.

#### Scenario: Audit fields are populated on insert
- **WHEN** a Manager creates a Recipe
- **THEN** the row carries `createdBy=<userId>`, `updatedBy=<userId>`, `createdAt=<now>`, `updatedAt=<now>`

#### Scenario: updatedBy/updatedAt are refreshed on update
- **WHEN** a Manager updates the Recipe's name
- **THEN** `updatedBy` and `updatedAt` reflect the editing user and time; `createdBy` and `createdAt` remain unchanged
