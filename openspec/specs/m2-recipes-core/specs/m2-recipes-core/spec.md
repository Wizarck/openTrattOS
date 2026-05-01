## ADDED Requirements

### Requirement: Recipe CRUD with multi-tenant scope

The system SHALL allow Owner/Manager users to create, read, update, and soft-delete Recipes scoped by `organizationId`. Staff SHALL have read-only access.

#### Scenario: Manager creates a Recipe with composed lines
- **WHEN** a Manager POSTs `/recipes` with `name`, `wasteFactor`, and an array of RecipeIngredient lines (mix of `ingredientId` and `subRecipeId` references)
- **THEN** the Recipe persists, audit fields populate, and the response includes the persisted id + computed line count

#### Scenario: Staff cannot create a Recipe
- **WHEN** a Staff user POSTs `/recipes`
- **THEN** the system returns 403 Forbidden

#### Scenario: Owner soft-deletes a Recipe
- **WHEN** an Owner sends DELETE `/recipes/:id` for a Recipe with no active MenuItem references
- **THEN** the Recipe row is updated with `isActive=false`; subsequent GET still returns the row but with `isActive` set; new sub-recipe selection excludes it

### Requirement: Cycle detection on save with named-nodes error

The system SHALL reject any save (create or update) that would introduce a cycle in the sub-recipe graph. The error message SHALL name both nodes and the cycle direction.

#### Scenario: Direct cycle is rejected
- **WHEN** a Manager attempts to save Recipe A with a sub-recipe line pointing to itself
- **THEN** the system returns 422 with `{code: "CYCLE", node1Id, node1Name, node2Id, node2Name, direction}`

#### Scenario: Indirect cycle is rejected
- **WHEN** a Manager creates Recipe A → sub-recipe B, then attempts to update B to add Recipe A as a sub-recipe
- **THEN** the system returns 422 with the cycle error naming A and B and direction "B → A → B"

#### Scenario: Deep tree without cycle saves successfully
- **WHEN** a Manager saves a Recipe with sub-recipe chain of depth 3 (A → B → C → D ingredient leaves)
- **THEN** the save succeeds; the cycle detector traverses without false-positive

#### Scenario: Tree exceeding depth cap is rejected
- **WHEN** a Manager attempts to save a Recipe whose sub-recipe chain would exceed depth 10
- **THEN** the system returns 422 with `{code: "DEPTH_LIMIT", maxDepth: 10}`

### Requirement: Soft-deleted Recipes show Discontinued badge in dependent refs

The system SHALL keep soft-deleted Recipes referenceable from existing MenuItems but exclude them from new sub-recipe selection.

#### Scenario: Existing MenuItem ref displays Discontinued
- **WHEN** a MenuItem references a Recipe that is later soft-deleted, then a user GETs the MenuItem
- **THEN** the response includes the Recipe payload with `isActive=false` and `displayLabel="(Discontinued)"`

#### Scenario: New sub-recipe selection excludes inactive Recipes
- **WHEN** a Manager queries `GET /recipes?selectableForSubRecipe=true`
- **THEN** soft-deleted Recipes are excluded from the result list

### Requirement: Audit fields populate on Recipe writes

The system SHALL populate `createdBy`, `updatedBy`, `createdAt`, `updatedAt` on every Recipe insert and update per PRD-1 §FR48.

#### Scenario: Create populates createdBy + updatedBy
- **WHEN** a Manager creates a Recipe
- **THEN** `createdBy` and `updatedBy` are set to the Manager's userId, `createdAt` and `updatedAt` set to the current server time

#### Scenario: Update refreshes updatedBy + updatedAt only
- **WHEN** a different Manager edits the Recipe
- **THEN** `updatedBy` and `updatedAt` reflect the editing user; `createdBy` and `createdAt` unchanged
