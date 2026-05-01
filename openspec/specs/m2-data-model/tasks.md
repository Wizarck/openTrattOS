## 1. TypeORM entities

- [x] 1.1 Create `apps/api/src/recipes/entities/recipe.entity.ts` with id, organizationId, name, description, notes, wasteFactor, isActive, audit fields
- [x] 1.2 Create `apps/api/src/recipes/entities/recipe-ingredient.entity.ts` with id, recipeId, ingredientId (nullable), subRecipeId (nullable), quantity, unitId, yieldPercentOverride (nullable), sourceOverrideRef (nullable)
- [x] 1.3 Create `apps/api/src/menu-items/entities/menu-item.entity.ts` with id, organizationId, recipeId, locationId, channel, sellingPrice, targetMargin, isActive, audit fields
- [x] 1.4 Extend `apps/api/src/ingredients/entities/ingredient.entity.ts` with nutrition (jsonb), allergens (text[]), dietFlags (text[]), brandName (nullable), externalSourceRef (nullable)
- [x] 1.5 Extend `apps/api/src/users/entities/user.entity.ts` with phoneNumber (E.164 nullable string)

## 2. Database migration

- [x] 2.1 Generate migration `<timestamp>-m2-data-model.ts` via TypeORM CLI
- [x] 2.2 Add CHECK constraint on `recipe_ingredient`: exactly one of `ingredient_id` or `sub_recipe_id` non-null
- [x] 2.3 Add cascade rules: `recipe_ingredient.recipe_id ON DELETE CASCADE`; `menu_item.recipe_id ON DELETE RESTRICT`
- [x] 2.4 Add indexes: `recipe(organization_id, is_active)`, `recipe_ingredient(recipe_id)`, `recipe_ingredient(sub_recipe_id)`, `menu_item(organization_id, location_id)`, `menu_item(recipe_id)`
- [x] 2.5 Verify down-migration cleanly drops the 3 new tables + 5 new columns without touching M1 data

## 3. Repository stubs (no service logic in this slice)

- [x] 3.1 Create `RecipeRepository` (TypeORM repository wrapper, no custom methods yet)
- [x] 3.2 Create `RecipeIngredientRepository`
- [x] 3.3 Create `MenuItemRepository`
- [x] 3.4 Wire repositories into the existing modules (`RecipesModule`, `MenuItemsModule`) but do NOT expose controllers — those land in #2 / #5 / #8

## 4. Tests

- [x] 4.1 Migration up + down round-trip test
- [x] 4.2 CHECK constraint enforcement: insert with both/neither FK fails
- [x] 4.3 Audit fields populated correctly on Recipe / RecipeIngredient / MenuItem inserts
- [x] 4.4 Cross-org isolation: row from org A is invisible to user from org B at repository level
- [x] 4.5 Ingredient extensions: existing M1 rows survive migration with NULL/empty defaults

## 5. Verification

- [x] 5.1 Run `openspec validate m2-data-model` — must pass
- [x] 5.2 Manual smoke: deploy migration to staging, insert sample Recipe + 3 RecipeIngredients (one with sub-Recipe), verify schema + cascade
- [x] 5.3 Confirm M1 endpoints (Ingredient CRUD, Supplier CRUD) still pass their own test suites
