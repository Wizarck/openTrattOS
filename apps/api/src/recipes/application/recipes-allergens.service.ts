import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import {
  RECIPE_ALLERGENS_OVERRIDE_CHANGED,
  RecipeAllergensOverrideChangedEvent,
} from '../../cost/application/cost.events';
import { Ingredient } from '../../ingredients/domain/ingredient.entity';
import { AllergensOverride, DietFlagsOverride, Recipe } from '../domain/recipe.entity';
import { RecipeIngredient } from '../domain/recipe-ingredient.entity';

/**
 * Standard contradictions between a diet flag and an allergen, used by
 * `getDietFlagsRollup`. A diet flag is dropped (and a warning emitted) when
 * the recipe contains any of the contradicting allergens. EU 1169/2011
 * Annex II naming is used (lower-case, hyphenless where possible).
 *
 * Per design.md §"Conservative inference": false negatives are merely
 * conservative ("we don't claim it's vegan"); false positives in regulatory
 * metadata are dangerous. Always err on the side of dropping the flag.
 */
const DIET_FLAG_CONTRADICTIONS: Record<string, readonly string[]> = {
  vegan: ['milk', 'eggs', 'fish', 'crustaceans', 'molluscs'],
  vegetarian: ['fish', 'crustaceans', 'molluscs'],
  'gluten-free': ['gluten'],
};

export interface AllergensRollup {
  /** Conservatively-aggregated allergen list (after override merge). */
  aggregated: string[];
  /** Per-leaf-ingredient attribution: ingredientId → allergens contributed. */
  byIngredient: Record<string, string[]>;
  /** The Manager+ override payload, if any. */
  override: AllergensOverride | null;
  /** Cross-contamination note + structured tags (independent of `aggregated`). */
  crossContamination: {
    note: string | null;
    allergens: string[];
  };
}

export interface DietFlagsRollup {
  /** Conservatively-inferred diet flags (after override merge). */
  inferred: string[];
  /** Per-leaf-ingredient attribution: ingredientId → diet flags carried. */
  byIngredient: Record<string, string[]>;
  /** The Manager+ override payload, if any. */
  override: DietFlagsOverride | null;
  /** Conflicts surfaced during inference (e.g. "vegan ⊥ milk"). */
  warnings: string[];
}

export interface ApplyAllergensOverrideInput {
  /** Allergens to add to the conservatively-aggregated set. */
  add: string[];
  /** Allergens to remove from the conservatively-aggregated set. */
  remove: string[];
  /** Audit reason (must be non-empty). */
  reason: string;
}

export interface ApplyDietFlagsOverrideInput {
  /** Diet-flag set the Manager declares true for the Recipe. */
  flags: string[];
  /** Audit reason (must be non-empty). */
  reason: string;
}

export interface ApplyCrossContaminationInput {
  /** Free-text note (e.g. "Made on shared line with peanuts"). Required. */
  note: string;
  /** Structured allergen tags backing the note. Required, non-empty. */
  allergens: string[];
}

export class RecipeAllergensNotFoundError extends Error {
  readonly recipeId: string;
  constructor(recipeId: string) {
    super(`Recipe not found for allergens rollup: ${recipeId}`);
    this.name = 'RecipeAllergensNotFoundError';
    this.recipeId = recipeId;
  }
}

export class OverrideMissingReasonError extends Error {
  constructor(public readonly kind: 'allergens' | 'diet-flags') {
    super(`Override on ${kind} requires a non-empty reason`);
    this.name = 'OverrideMissingReasonError';
  }
}

export class CrossContaminationMissingTagsError extends Error {
  constructor() {
    super(
      'Cross-contamination requires both a free-text note and a non-empty structured allergens array',
    );
    this.name = 'CrossContaminationMissingTagsError';
  }
}

/**
 * Recipe-level allergen aggregation + diet-flag inference + Manager+ override
 * service. Implements EU 1169/2011 Article 21 conservative-inference rules
 * per ADR-017 / FR25–FR28.
 *
 * Key design points (from openspec/changes/m2-allergens-article-21/design.md):
 *
 *   - Aggregation is read-time, never stored. Same pattern as `CostService`.
 *   - Inference is conservative: a diet flag is true at recipe level only if
 *     EVERY leaf ingredient carries it AND no contradicting allergen is
 *     present. False positives are dangerous; false negatives are safe.
 *   - Override applies on top of aggregation: final = (aggregated ∪ add) − remove.
 *   - Cycle defence is belt-and-braces: cycle-detector should already have
 *     prevented cycles, but the tree walker tracks a `visiting` set and throws
 *     loudly if it ever sees a back-edge.
 *
 * Multi-tenant: every read filters by organizationId.
 */
@Injectable()
export class RecipesAllergensService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly events: EventEmitter2,
  ) {}

  // ----------------------------- read paths -----------------------------

  async getAllergensRollup(
    organizationId: string,
    recipeId: string,
  ): Promise<AllergensRollup> {
    const recipe = await this.dataSource
      .getRepository(Recipe)
      .findOneBy({ id: recipeId, organizationId });
    if (!recipe) throw new RecipeAllergensNotFoundError(recipeId);

    const leaves = await this.collectLeafIngredients(
      this.dataSource.manager,
      organizationId,
      recipe.id,
    );

    const byIngredient: Record<string, string[]> = {};
    const aggSet = new Set<string>();
    for (const ing of leaves) {
      const list = (ing.allergens ?? []).filter((a) => typeof a === 'string' && a.length > 0);
      if (list.length === 0) {
        // Still record the ingredient with an empty list for traceability.
        byIngredient[ing.id] = [];
        continue;
      }
      byIngredient[ing.id] = [...list];
      for (const a of list) aggSet.add(a);
    }

    // Cross-contamination allergens are NOT mixed into `aggregated` per
    // design.md ("X is in the recipe" vs "X may have touched the recipe in
    // production" — distinct fields). They surface alongside, not inside.

    const override = recipe.aggregatedAllergensOverride ?? null;
    const merged = mergeAllergensOverride(Array.from(aggSet), override);

    return {
      aggregated: merged,
      byIngredient,
      override,
      crossContamination: {
        note: recipe.crossContaminationNote ?? null,
        allergens: [...(recipe.crossContaminationAllergens ?? [])],
      },
    };
  }

  async getDietFlagsRollup(
    organizationId: string,
    recipeId: string,
  ): Promise<DietFlagsRollup> {
    const recipe = await this.dataSource
      .getRepository(Recipe)
      .findOneBy({ id: recipeId, organizationId });
    if (!recipe) throw new RecipeAllergensNotFoundError(recipeId);

    const leaves = await this.collectLeafIngredients(
      this.dataSource.manager,
      organizationId,
      recipe.id,
    );

    const byIngredient: Record<string, string[]> = {};
    const allergenSet = new Set<string>();
    const candidateFlags = new Set<string>();
    for (const ing of leaves) {
      const flags = (ing.dietFlags ?? []).filter((f) => typeof f === 'string' && f.length > 0);
      byIngredient[ing.id] = [...flags];
      for (const f of flags) candidateFlags.add(f);
      for (const a of ing.allergens ?? []) allergenSet.add(a);
    }

    const warnings: string[] = [];
    const inferred: string[] = [];

    // A flag is inferred only if (a) every leaf carries it AND (b) no
    // contradicting allergen is present. Empty recipes (zero leaves) cannot
    // claim any flag — universal-quantifier-over-empty-set would yield true,
    // but this is a regulatory contract: refuse to claim what we cannot prove.
    //
    // Warnings have a wider trigger than inference: any candidate flag with a
    // contradicting allergen surfaces a warning, even when not all leaves
    // carry the flag. UX rationale: a chef who tagged tomato as vegan and
    // then dropped butter into the recipe should be told "vegan is
    // contradicted by milk" — not silently ignored just because flour wasn't
    // also vegan-tagged.
    if (leaves.length > 0) {
      for (const flag of candidateFlags) {
        const contradictions = DIET_FLAG_CONTRADICTIONS[flag] ?? [];
        const conflicting = contradictions.filter((c) => allergenSet.has(c));
        const everyCarries = leaves.every((ing) => (ing.dietFlags ?? []).includes(flag));
        if (conflicting.length > 0) {
          warnings.push(
            `Diet flag "${flag}" candidate (carried by ${
              everyCarries ? 'all' : 'some'
            } ingredients) is contradicted by allergen(s): ${conflicting.join(', ')}; flag not asserted.`,
          );
          continue;
        }
        if (!everyCarries) continue;
        inferred.push(flag);
      }
    }
    inferred.sort();

    const override = recipe.dietFlagsOverride ?? null;
    const merged = override ? [...override.flags] : inferred;

    return {
      inferred: merged,
      byIngredient,
      override,
      warnings,
    };
  }

  // ----------------------------- write paths -----------------------------

  async applyAllergensOverride(
    organizationId: string,
    actorUserId: string,
    recipeId: string,
    input: ApplyAllergensOverrideInput,
  ): Promise<Recipe> {
    if (typeof input.reason !== 'string' || input.reason.trim().length === 0) {
      throw new OverrideMissingReasonError('allergens');
    }
    const saved = await this.dataSource.transaction(async (em) => {
      const repo = em.getRepository(Recipe);
      const recipe = await repo.findOneBy({ id: recipeId, organizationId });
      if (!recipe) throw new RecipeAllergensNotFoundError(recipeId);
      recipe.aggregatedAllergensOverride = {
        add: dedupeStrings(input.add ?? []),
        remove: dedupeStrings(input.remove ?? []),
        reason: input.reason.trim(),
        appliedBy: actorUserId,
        appliedAt: new Date().toISOString(),
      };
      recipe.updatedBy = actorUserId;
      return repo.save(recipe);
    });
    this.emitOverrideChanged(saved, 'allergens-override', actorUserId);
    return saved;
  }

  async applyDietFlagsOverride(
    organizationId: string,
    actorUserId: string,
    recipeId: string,
    input: ApplyDietFlagsOverrideInput,
  ): Promise<Recipe> {
    if (typeof input.reason !== 'string' || input.reason.trim().length === 0) {
      throw new OverrideMissingReasonError('diet-flags');
    }
    const saved = await this.dataSource.transaction(async (em) => {
      const repo = em.getRepository(Recipe);
      const recipe = await repo.findOneBy({ id: recipeId, organizationId });
      if (!recipe) throw new RecipeAllergensNotFoundError(recipeId);
      recipe.dietFlagsOverride = {
        flags: dedupeStrings(input.flags ?? []),
        reason: input.reason.trim(),
        appliedBy: actorUserId,
        appliedAt: new Date().toISOString(),
      };
      recipe.updatedBy = actorUserId;
      return repo.save(recipe);
    });
    this.emitOverrideChanged(saved, 'diet-flags-override', actorUserId);
    return saved;
  }

  async applyCrossContamination(
    organizationId: string,
    actorUserId: string,
    recipeId: string,
    input: ApplyCrossContaminationInput,
  ): Promise<Recipe> {
    const note = typeof input.note === 'string' ? input.note.trim() : '';
    const tags = dedupeStrings(input.allergens ?? []);
    if (note.length === 0 || tags.length === 0) {
      throw new CrossContaminationMissingTagsError();
    }
    const saved = await this.dataSource.transaction(async (em) => {
      const repo = em.getRepository(Recipe);
      const recipe = await repo.findOneBy({ id: recipeId, organizationId });
      if (!recipe) throw new RecipeAllergensNotFoundError(recipeId);
      recipe.crossContaminationNote = note;
      recipe.crossContaminationAllergens = tags;
      recipe.updatedBy = actorUserId;
      return repo.save(recipe);
    });
    this.emitOverrideChanged(saved, 'cross-contamination', actorUserId);
    return saved;
  }

  // ------------------------------ helpers ------------------------------

  /**
   * Walks the sub-recipe tree of `recipeId` and returns the union of leaf
   * Ingredient entities. Leaves are only the actual `ingredientId`-bearing
   * lines; sub-recipes contribute their leaves (transitively), not themselves.
   *
   * Cycle defence is belt-and-braces: the org-wide cycle-detector should
   * already have rejected any recipe graph with a cycle, but the visited-set
   * here mirrors `CostService.computeWithEm` so we fail loud rather than spin.
   */
  private async collectLeafIngredients(
    em: EntityManager,
    organizationId: string,
    recipeId: string,
  ): Promise<Ingredient[]> {
    const ingredientIds = new Set<string>();
    const visiting = new Set<string>();
    await this.walk(em, organizationId, recipeId, visiting, ingredientIds);
    if (ingredientIds.size === 0) return [];
    return em.getRepository(Ingredient).findBy({ id: In([...ingredientIds]) });
  }

  private async walk(
    em: EntityManager,
    organizationId: string,
    recipeId: string,
    visiting: Set<string>,
    out: Set<string>,
  ): Promise<void> {
    if (visiting.has(recipeId)) {
      // Cycle defence belt-and-braces; cycle-detector should already have prevented this.
      throw new Error(`RecipesAllergensService: cycle detected at recipe ${recipeId}`);
    }
    visiting.add(recipeId);
    const lines = await em.getRepository(RecipeIngredient).findBy({ recipeId });
    for (const line of lines) {
      if (line.ingredientId) {
        out.add(line.ingredientId);
        continue;
      }
      if (line.subRecipeId) {
        // Confirm the sub-recipe is in the same org; cross-tenant references
        // shouldn't exist (FK + cycle-detector both gate this), but read with
        // the filter for defence in depth.
        const sub = await em
          .getRepository(Recipe)
          .findOneBy({ id: line.subRecipeId, organizationId });
        if (!sub) continue;
        await this.walk(em, organizationId, sub.id, visiting, out);
      }
    }
    visiting.delete(recipeId);
  }

  private emitOverrideChanged(
    recipe: Recipe,
    kind: RecipeAllergensOverrideChangedEvent['kind'],
    appliedBy: string,
  ): void {
    this.events.emit(RECIPE_ALLERGENS_OVERRIDE_CHANGED, {
      recipeId: recipe.id,
      organizationId: recipe.organizationId,
      kind,
      appliedBy,
    } satisfies RecipeAllergensOverrideChangedEvent);
  }
}

// ----------------------------- pure helpers -----------------------------

function dedupeStrings(xs: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of xs) {
    if (typeof x !== 'string') continue;
    const trimmed = x.trim();
    if (trimmed.length === 0) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/**
 * Final allergen list = (aggregated ∪ override.add) − override.remove.
 * Returns a sorted array for deterministic output. When `override` is null,
 * the aggregated list is returned sorted.
 */
export function mergeAllergensOverride(
  aggregated: readonly string[],
  override: AllergensOverride | null,
): string[] {
  const set = new Set(aggregated);
  if (override) {
    for (const a of override.add ?? []) set.add(a);
    for (const r of override.remove ?? []) set.delete(r);
  }
  return Array.from(set).sort();
}
