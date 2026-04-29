## Why

Module 2 introduces four new entities (Recipe, RecipeIngredient, MenuItem) and extends Ingredient + User with M2-specific columns. Without a dedicated foundation change, ten downstream M2 changes would each touch the schema and step on each other. This change isolates schema work as a single atomic migration so every other M2 slice can build against a stable contract.

## What Changes

- New entity `Recipe`: `id`, `organizationId`, `name`, `description` (i18n in org `defaultLocale`), `notes` (nullable), `wasteFactor` (decimal), `isActive` (soft-delete flag), audit fields per PRD-1 pattern.
- New entity `RecipeIngredient`: `id`, `recipeId`, `componentId` (polymorphic to `ingredientId` OR `subRecipeId`), `quantity`, `unitId`, `yieldPercentOverride` (nullable), `sourceOverrideRef` (nullable for SupplierItem override).
- New entity `MenuItem`: `id`, `organizationId`, `recipeId`, `locationId`, `channel`, `sellingPrice`, `targetMargin`, `isActive`, audit fields.
- Extensions on existing `Ingredient` table: `nutrition` (jsonb — kcal + macros per 100g/ml), `allergens` (text[]), `dietFlags` (text[]), `brandName` (string nullable), `externalSourceRef` (string nullable, e.g. OFF product code).
- Retrofit on existing `User` table: `phoneNumber` (E.164 string, nullable) for future M2.x WhatsApp routing per FR41+ Agent-Ready Foundation.
- Multi-tenant invariant: `organizationId` foreign-key on every new table, cascade per ADR-010.
- Audit fields (`createdBy`, `updatedBy`, `createdAt`, `updatedAt`) on every entity per PRD-1 §FR47–48 pattern.
- Cycle-detection precondition: graph-walk algorithm + depth cap (10) lives in #2 (recipes-core); this change only ships the schema that supports it.
- **BREAKING** (none — additive only; M1 entities unaffected).

## Capabilities

### New Capabilities

- `m2-data-model`: schema migrations for Recipe, RecipeIngredient, MenuItem, plus Ingredient + User column extensions. Foundation kernel for all M2 slices.

### Modified Capabilities

(none — pure-additive; M1 specs are not amended.)

## Impact

- **Code**: TypeORM entity files + migrations under `apps/api/src/`. New repository stubs (Recipe, RecipeIngredient, MenuItem) wired but not exposed via controllers in this change — services come in #2, #5, #8.
- **Database**: PostgreSQL migration adds 3 tables + 5 columns on existing tables. Indexes per ADR-010. Cascade on `organizationId` delete.
- **Other M2 slices**: every other change in `docs/openspec-slice.md` lists `#1` in its `Depends on` column. Land this first.
- **No UI** in this change. No API endpoints. No service logic. Pure schema.
