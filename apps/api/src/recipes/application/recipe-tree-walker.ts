import { EntityManager } from 'typeorm';
import { Recipe } from '../domain/recipe.entity';
import { RecipeIngredient } from '../domain/recipe-ingredient.entity';

/**
 * Shared recipe-tree walker for read-time leaf accumulation. Used by
 * `m2-ingredients-extension` macro rollup; future callers (allergens, label
 * rendering) can adopt it. `cost.service` retains its own walker because of
 * its per-request memoization cache + currency aggregation contract — those
 * are recipe-cost-specific and don't generalise cleanly here.
 *
 * Cycle defence: belt-and-braces. The org-wide cycle-detector (#2) should
 * already have rejected any graph with a cycle, but the runtime walker
 * tracks `visiting` and throws on revisit.
 */

export const DEFAULT_TREE_DEPTH_CAP = 10;

export interface TreeWalkerOptions {
  /** Maximum recursion depth. Defaults to 10 per NFR Scalability. */
  depthCap?: number;
}

export interface LeafContext {
  /** The recipe-ingredient line that resolves to this leaf (line carries quantity, unit, yield override, sourceOverrideRef). */
  line: RecipeIngredient;
  /** Parent Recipe row at the time of the leaf visit (for wasteFactor + name). */
  parentRecipe: Recipe;
  /** Per-walk depth at which this leaf was reached (root = 0). */
  depth: number;
  /**
   * Effective cumulative multiplier from the root to this leaf, including
   * the parent recipe's wasteFactor. Caller multiplies leaf quantity by this
   * to get the final-portion contribution. Format: `Πᵢ (yieldᵢ × (1 − wasteᵢ))`.
   */
  cumulativeYieldWaste: number;
  /**
   * Quantity of the leaf line scaled by the chain of sub-recipe `quantity`
   * multipliers from root to leaf. Format: `qtyLeaf × Πᵢ qtySubᵢ`.
   * Multiply by `cumulativeYieldWaste` for the actual portion contribution.
   */
  scaledQuantity: number;
}

export class RecipeTreeRecipeNotFoundError extends Error {
  readonly recipeId: string;
  constructor(recipeId: string) {
    super(`Recipe not found while walking tree: ${recipeId}`);
    this.name = 'RecipeTreeRecipeNotFoundError';
    this.recipeId = recipeId;
  }
}

export class RecipeTreeCycleError extends Error {
  readonly recipeId: string;
  constructor(recipeId: string) {
    super(`Cycle detected while walking recipe tree at ${recipeId}`);
    this.name = 'RecipeTreeCycleError';
    this.recipeId = recipeId;
  }
}

export class RecipeTreeDepthLimitError extends Error {
  readonly depthCap: number;
  readonly recipeId: string;
  constructor(depthCap: number, recipeId: string) {
    super(`Recipe tree depth cap (${depthCap}) exceeded at ${recipeId}`);
    this.name = 'RecipeTreeDepthLimitError';
    this.depthCap = depthCap;
    this.recipeId = recipeId;
  }
}

/**
 * Walks the recipe sub-recipe tree from `rootRecipeId`, invoking `onLeaf` for
 * each leaf-ingredient `RecipeIngredient` encountered. Sub-recipe lines do
 * NOT trigger `onLeaf`; they recurse instead.
 *
 * Cumulative multipliers reflect the chain: if Recipe A composes Sub-recipe B
 * with quantity 3 and yieldOverride 0.9, and B uses Ingredient X with quantity
 * 2 and yieldOverride 1.0, then X's `scaledQuantity` is 6 and
 * `cumulativeYieldWaste` is `0.9 × (1 − wasteB) × 1.0 × (1 − wasteA)`.
 */
export async function walkRecipeTree(
  em: EntityManager,
  organizationId: string,
  rootRecipeId: string,
  onLeaf: (ctx: LeafContext) => Promise<void> | void,
  options: TreeWalkerOptions = {},
): Promise<void> {
  const cap = options.depthCap ?? DEFAULT_TREE_DEPTH_CAP;
  const visiting = new Set<string>();
  await walk(em, organizationId, rootRecipeId, onLeaf, visiting, 0, cap, 1, 1);
}

async function walk(
  em: EntityManager,
  organizationId: string,
  recipeId: string,
  onLeaf: (ctx: LeafContext) => Promise<void> | void,
  visiting: Set<string>,
  depth: number,
  depthCap: number,
  inboundYieldWaste: number,
  inboundQuantityChain: number,
): Promise<void> {
  if (depth > depthCap) {
    throw new RecipeTreeDepthLimitError(depthCap, recipeId);
  }
  if (visiting.has(recipeId)) {
    throw new RecipeTreeCycleError(recipeId);
  }
  const recipe = await em.getRepository(Recipe).findOneBy({ id: recipeId, organizationId });
  if (!recipe) {
    throw new RecipeTreeRecipeNotFoundError(recipeId);
  }
  visiting.add(recipeId);

  const lines = await em.getRepository(RecipeIngredient).findBy({ recipeId });
  const wasteFactor = Number(recipe.wasteFactor);

  for (const line of lines) {
    const lineYield = line.yieldPercentOverride === null ? 1 : Number(line.yieldPercentOverride);
    const lineCumulativeYieldWaste = inboundYieldWaste * lineYield * (1 - wasteFactor);

    if (line.ingredientId !== null) {
      const scaledQuantity = inboundQuantityChain * Number(line.quantity);
      await onLeaf({
        line,
        parentRecipe: recipe,
        depth,
        cumulativeYieldWaste: lineCumulativeYieldWaste,
        scaledQuantity,
      });
      continue;
    }

    if (line.subRecipeId !== null) {
      const subQuantityChain = inboundQuantityChain * Number(line.quantity);
      await walk(
        em,
        organizationId,
        line.subRecipeId,
        onLeaf,
        visiting,
        depth + 1,
        depthCap,
        lineCumulativeYieldWaste,
        subQuantityChain,
      );
    }
  }

  visiting.delete(recipeId);
}

/** Test helper — exposes the recursion limit constant. */
export const TREE_WALKER_DEFAULT_DEPTH_CAP = DEFAULT_TREE_DEPTH_CAP;
