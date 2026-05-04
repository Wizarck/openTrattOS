/**
 * Domain events emitted to drive cost recompute + history append. Anyone who
 * mutates a cost-affecting field (SupplierItem price, RecipeIngredient line,
 * sub-recipe composition, override) MUST emit one of these.
 */

export const SUPPLIER_PRICE_UPDATED = 'cost.supplier-price-updated';
export const RECIPE_INGREDIENT_UPDATED = 'cost.recipe-ingredient-updated';
export const RECIPE_SOURCE_OVERRIDE_CHANGED = 'cost.recipe-source-override-changed';
export const SUB_RECIPE_COST_CHANGED = 'cost.sub-recipe-cost-changed';

export interface SupplierPriceUpdatedEvent {
  supplierItemId: string;
  ingredientId: string;
  organizationId: string;
}

export interface RecipeIngredientUpdatedEvent {
  recipeId: string;
  organizationId: string;
  recipeIngredientId: string;
}

export interface RecipeSourceOverrideChangedEvent {
  recipeId: string;
  organizationId: string;
  recipeIngredientId: string;
  sourceOverrideRef: string | null;
}

export interface SubRecipeCostChangedEvent {
  /** The sub-recipe whose cost just shifted; the listener walks parents. */
  subRecipeId: string;
  organizationId: string;
}
