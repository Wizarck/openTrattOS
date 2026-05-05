/**
 * Domain events emitted to drive cost recompute + history append. Anyone who
 * mutates a cost-affecting field (SupplierItem price, RecipeIngredient line,
 * sub-recipe composition, override) MUST emit one of these.
 */

export const SUPPLIER_PRICE_UPDATED = 'cost.supplier-price-updated';
export const RECIPE_INGREDIENT_UPDATED = 'cost.recipe-ingredient-updated';
export const RECIPE_SOURCE_OVERRIDE_CHANGED = 'cost.recipe-source-override-changed';
export const SUB_RECIPE_COST_CHANGED = 'cost.sub-recipe-cost-changed';

/**
 * Emitted by RecipesAllergensService whenever the override / cross-contamination
 * state on a Recipe changes (allergen override, diet-flag override, or
 * cross-contamination note). Listeners (e.g. cost-history, label rendering) may
 * react to recompute or invalidate caches; the cost subsystem currently has no
 * handler for this event but the channel is reserved here so additions don't
 * fan out to a new file.
 */
export const RECIPE_ALLERGENS_OVERRIDE_CHANGED = 'cost.recipe-allergens-override-changed';

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

/**
 * Payload for `RECIPE_ALLERGENS_OVERRIDE_CHANGED`. `kind` lets a listener
 * route on what actually changed; the event itself is fire-and-forget — the
 * authoritative source of truth is always the Recipe row.
 */
export interface RecipeAllergensOverrideChangedEvent {
  recipeId: string;
  organizationId: string;
  kind: 'allergens-override' | 'diet-flags-override' | 'cross-contamination';
  /** UUID of the Manager+ actor who applied the change. */
  appliedBy: string;
}
