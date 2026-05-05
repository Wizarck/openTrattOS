import { EntityManager } from 'typeorm';
import { Recipe } from '../domain/recipe.entity';
import { RecipeIngredient } from '../domain/recipe-ingredient.entity';

/**
 * Shared recipe-tree walker. Two named operations sharing primitives:
 *
 *   `walkRecipeTreeLeaves(em, orgId, recipeId, onLeaf)` — visitor over leaf
 *     RecipeIngredient lines. Used by allergens, macros, label-data resolver.
 *
 *   `foldRecipeTree<T>(em, orgId, recipeId, fold)` — post-order accumulator
 *     with built-in memoization on `recipeId`. Used by cost.service.
 *
 * Cycle defence: belt-and-braces. The org-wide cycle-detector should already
 * have rejected any graph with a cycle, but the runtime walkers track
 * `visiting` and throw on revisit.
 *
 * Missing sub-recipe handling: `options.onMissingSubRecipe` controls behavior
 * when `RecipeIngredient.subRecipeId` references a non-existent Recipe at
 * depth > 0. Default `'throw'`; pass `'skip'` to tolerate dangling references
 * (cost.service + allergens use `'skip'` historically; macros uses `'throw'`).
 */

export const DEFAULT_TREE_DEPTH_CAP = 10;

export interface TreeWalkerOptions {
  /** Maximum recursion depth. Defaults to 10 per NFR Scalability. */
  depthCap?: number;
  /**
   * Behavior when a sub-recipe reference at depth > 0 points to a missing Recipe.
   * `'throw'` (default) → `RecipeTreeRecipeNotFoundError`.
   * `'skip'` → omit from `subResults` (fold) / skip leaves under it (visitor).
   * The root recipe ALWAYS throws if missing regardless of this option.
   */
  onMissingSubRecipe?: 'throw' | 'skip';
}

export interface LeafContext {
  /** The recipe-ingredient line that resolves to this leaf. */
  line: RecipeIngredient;
  /** Parent Recipe row at the time of the leaf visit. */
  parentRecipe: Recipe;
  /** Per-walk depth at which this leaf was reached (root = 0). */
  depth: number;
  /**
   * Effective cumulative multiplier from the root to this leaf, including
   * every ancestor's wasteFactor: `Πᵢ (yieldᵢ × (1 − wasteᵢ))`.
   */
  cumulativeYieldWaste: number;
  /**
   * Quantity of the leaf line scaled by the chain of sub-recipe `quantity`
   * multipliers from root to leaf: `qtyLeaf × Πᵢ qtySubᵢ`.
   */
  scaledQuantity: number;
}

export interface FoldContext<T> {
  /** The Recipe at this level of the fold. */
  recipe: Recipe;
  /** All RecipeIngredient lines belonging to `recipe` (ingredient + sub-recipe). */
  lines: RecipeIngredient[];
  /** Map of `subRecipeId` → folded result for every successfully-resolved sub-recipe. */
  subResults: Map<string, T>;
  /** Per-walk depth at which this recipe was reached (root = 0). */
  depth: number;
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

// ---------------------------------------------------------------------------
// Public operations
// ---------------------------------------------------------------------------

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
export async function walkRecipeTreeLeaves(
  em: EntityManager,
  organizationId: string,
  rootRecipeId: string,
  onLeaf: (ctx: LeafContext) => Promise<void> | void,
  options: TreeWalkerOptions = {},
): Promise<void> {
  const cap = options.depthCap ?? DEFAULT_TREE_DEPTH_CAP;
  const onMissing = options.onMissingSubRecipe ?? 'throw';
  const visiting = new Set<string>();
  await walkLeaves(
    em,
    organizationId,
    rootRecipeId,
    onLeaf,
    visiting,
    0,
    cap,
    onMissing,
    1,
    1,
    /* isRoot */ true,
  );
}

/**
 * Walks the recipe sub-recipe tree from `rootRecipeId` post-order: every
 * sub-recipe's fold result is computed BEFORE the parent's fold is invoked.
 * Sub-recipes referenced multiple times are folded once (memoized).
 *
 * The fold callback receives `subResults` keyed by `subRecipeId` so it can
 * aggregate child results into the parent's accumulator.
 */
export async function foldRecipeTree<T>(
  em: EntityManager,
  organizationId: string,
  rootRecipeId: string,
  fold: (ctx: FoldContext<T>) => Promise<T> | T,
  options: TreeWalkerOptions = {},
): Promise<T> {
  const cap = options.depthCap ?? DEFAULT_TREE_DEPTH_CAP;
  const onMissing = options.onMissingSubRecipe ?? 'throw';
  const visiting = new Set<string>();
  const memo = new Map<string, T>();
  return walkFold(
    em,
    organizationId,
    rootRecipeId,
    fold,
    visiting,
    memo,
    0,
    cap,
    onMissing,
    /* isRoot */ true,
  );
}

// Backwards-compat alias preserved for callers prior to unification.
export const walkRecipeTree = walkRecipeTreeLeaves;

// ---------------------------------------------------------------------------
// Internal primitives
// ---------------------------------------------------------------------------

async function loadRecipe(
  em: EntityManager,
  organizationId: string,
  recipeId: string,
): Promise<Recipe | null> {
  return em.getRepository(Recipe).findOneBy({ id: recipeId, organizationId });
}

async function loadLines(em: EntityManager, recipeId: string): Promise<RecipeIngredient[]> {
  return em.getRepository(RecipeIngredient).findBy({ recipeId });
}

function checkPreconditions(
  recipeId: string,
  visiting: Set<string>,
  depth: number,
  depthCap: number,
): void {
  if (depth > depthCap) {
    throw new RecipeTreeDepthLimitError(depthCap, recipeId);
  }
  if (visiting.has(recipeId)) {
    throw new RecipeTreeCycleError(recipeId);
  }
}

async function walkLeaves(
  em: EntityManager,
  organizationId: string,
  recipeId: string,
  onLeaf: (ctx: LeafContext) => Promise<void> | void,
  visiting: Set<string>,
  depth: number,
  depthCap: number,
  onMissingSubRecipe: 'throw' | 'skip',
  inboundYieldWaste: number,
  inboundQuantityChain: number,
  isRoot: boolean,
): Promise<void> {
  checkPreconditions(recipeId, visiting, depth, depthCap);
  const recipe = await loadRecipe(em, organizationId, recipeId);
  if (!recipe) {
    if (isRoot || onMissingSubRecipe === 'throw') {
      throw new RecipeTreeRecipeNotFoundError(recipeId);
    }
    return;
  }

  visiting.add(recipeId);
  const lines = await loadLines(em, recipeId);
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
      await walkLeaves(
        em,
        organizationId,
        line.subRecipeId,
        onLeaf,
        visiting,
        depth + 1,
        depthCap,
        onMissingSubRecipe,
        lineCumulativeYieldWaste,
        subQuantityChain,
        /* isRoot */ false,
      );
    }
  }

  visiting.delete(recipeId);
}

async function walkFold<T>(
  em: EntityManager,
  organizationId: string,
  recipeId: string,
  fold: (ctx: FoldContext<T>) => Promise<T> | T,
  visiting: Set<string>,
  memo: Map<string, T>,
  depth: number,
  depthCap: number,
  onMissingSubRecipe: 'throw' | 'skip',
  isRoot: boolean,
): Promise<T> {
  if (memo.has(recipeId)) {
    return memo.get(recipeId) as T;
  }
  checkPreconditions(recipeId, visiting, depth, depthCap);

  const recipe = await loadRecipe(em, organizationId, recipeId);
  if (!recipe) {
    if (isRoot || onMissingSubRecipe === 'throw') {
      throw new RecipeTreeRecipeNotFoundError(recipeId);
    }
    // Permissive descendant: signal to caller via absence in subResults.
    return undefined as unknown as T;
  }

  visiting.add(recipeId);
  const lines = await loadLines(em, recipeId);

  const subResults = new Map<string, T>();
  for (const line of lines) {
    if (line.subRecipeId === null) continue;
    if (subResults.has(line.subRecipeId)) continue;
    if (memo.has(line.subRecipeId)) {
      subResults.set(line.subRecipeId, memo.get(line.subRecipeId) as T);
      continue;
    }
    try {
      const subResult = await walkFold(
        em,
        organizationId,
        line.subRecipeId,
        fold,
        visiting,
        memo,
        depth + 1,
        depthCap,
        onMissingSubRecipe,
        /* isRoot */ false,
      );
      // Only record if the sub actually resolved. Permissive misses return undefined.
      if (memo.has(line.subRecipeId)) {
        subResults.set(line.subRecipeId, subResult);
      }
    } catch (err) {
      if (err instanceof RecipeTreeRecipeNotFoundError && onMissingSubRecipe === 'skip') {
        continue;
      }
      throw err;
    }
  }

  const result = await fold({ recipe, lines, subResults, depth });
  visiting.delete(recipeId);
  memo.set(recipeId, result);
  return result;
}

/** Test helper — exposes the recursion limit constant. */
export const TREE_WALKER_DEFAULT_DEPTH_CAP = DEFAULT_TREE_DEPTH_CAP;
