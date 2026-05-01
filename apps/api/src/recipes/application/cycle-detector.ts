/**
 * Cycle detection for the Recipe sub-recipe graph (PRD-M2 FR6 + Journey 4).
 *
 * Rules per design:
 *   - The graph is built from `RecipeIngredient` rows where `subRecipeId` is non-null.
 *   - Self-reference is a cycle of length 1.
 *   - Indirect cycles (A → B → A) and longer must be detected.
 *   - Depth cap of 10 (NFR Scalability) protects against pathological inputs even
 *     when no cycle exists; exceeding it raises `DepthLimitError`.
 *
 * Pure functions — no DB, no DI. The orchestrating service hydrates the graph
 * (proposed lines + existing lines for siblings) and passes it in.
 */

export const DEFAULT_DEPTH_CAP = 10;

export interface RecipeNode {
  /** Recipe id (UUID v4). */
  readonly id: string;
  /** Display name — surfaced in the cycle error message. */
  readonly name: string;
}

/**
 * Adjacency list: a parent recipe id → the set of sub-recipe ids it directly
 * composes (the unique `subRecipeId` values among its `RecipeIngredient` rows).
 */
export type RecipeGraph = ReadonlyMap<string, ReadonlySet<string>>;

export interface CycleHit {
  readonly code: 'CYCLE';
  readonly node1Id: string;
  readonly node1Name: string;
  readonly node2Id: string;
  readonly node2Name: string;
  /** Human-readable: "<n1> -> ... -> <n2> -> <n1>" or self-reference. */
  readonly direction: string;
}

export class CycleDetectedError extends Error {
  readonly hit: CycleHit;
  constructor(hit: CycleHit) {
    super(`Recipe composition cycle: ${hit.direction}`);
    this.name = 'CycleDetectedError';
    this.hit = hit;
  }
}

export class DepthLimitError extends Error {
  readonly depthCap: number;
  readonly path: readonly string[];
  constructor(depthCap: number, path: readonly string[]) {
    super(`Recipe composition depth cap (${depthCap}) exceeded: ${path.join(' -> ')}`);
    this.name = 'DepthLimitError';
    this.depthCap = depthCap;
    this.path = path;
  }
}

export interface CycleDetectorOptions {
  /** Default 10. */
  depthCap?: number;
}

/**
 * Detects a cycle reachable from `startId` in `graph`. Returns null on no-cycle.
 *
 * Implementation: DFS with a visited-set (white/grey/black). A back edge to a
 * grey node = cycle. We carry the path stack so the error can include both
 * endpoint names + the direction.
 */
export function detectCycleFrom(
  startId: string,
  graph: RecipeGraph,
  nodesById: ReadonlyMap<string, RecipeNode>,
  options: CycleDetectorOptions = {},
): CycleHit | null {
  const cap = options.depthCap ?? DEFAULT_DEPTH_CAP;
  const grey = new Set<string>();
  const black = new Set<string>();
  const stack: string[] = [];

  function visit(id: string): CycleHit | null {
    if (stack.length >= cap) {
      throw new DepthLimitError(cap, [...stack, id]);
    }
    if (black.has(id)) return null;
    if (grey.has(id)) {
      // Back edge from the current path to `id`. Build a CycleHit referencing
      // the start of the cycle (id) and the immediate parent (last entry in stack).
      const startOfCycle = nodesById.get(id);
      const closingFrom = nodesById.get(stack[stack.length - 1] ?? id);
      const trail = [...stack.slice(stack.indexOf(id)), id]
        .map((n) => nodesById.get(n)?.name ?? n);
      return {
        code: 'CYCLE',
        node1Id: id,
        node1Name: startOfCycle?.name ?? id,
        node2Id: closingFrom?.id ?? id,
        node2Name: closingFrom?.name ?? id,
        direction: trail.join(' -> '),
      };
    }
    grey.add(id);
    stack.push(id);
    const children = graph.get(id);
    if (children) {
      for (const childId of children) {
        const hit = visit(childId);
        if (hit) return hit;
      }
    }
    stack.pop();
    grey.delete(id);
    black.add(id);
    return null;
  }

  return visit(startId);
}

/**
 * Self-reference convenience: a recipe pointing at itself directly.
 * Returns a CycleHit suitable for the error envelope.
 */
export function isSelfReference(
  recipeId: string,
  composedSubRecipeIds: Iterable<string>,
  nodesById: ReadonlyMap<string, RecipeNode>,
): CycleHit | null {
  for (const subId of composedSubRecipeIds) {
    if (subId === recipeId) {
      const node = nodesById.get(recipeId);
      const name = node?.name ?? recipeId;
      return {
        code: 'CYCLE',
        node1Id: recipeId,
        node1Name: name,
        node2Id: recipeId,
        node2Name: name,
        direction: `${name} -> ${name} (self-reference)`,
      };
    }
  }
  return null;
}
