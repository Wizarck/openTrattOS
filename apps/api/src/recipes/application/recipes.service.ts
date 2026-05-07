import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull, Not } from 'typeorm';
import {
  RECIPE_INGREDIENT_UPDATED,
  RECIPE_SOURCE_OVERRIDE_CHANGED,
} from '../../cost/application/cost.events';
import type { AuditEventEnvelope } from '../../audit-log/application/types';
import { MenuItem } from '../../menus/domain/menu-item.entity';
import { Recipe } from '../domain/recipe.entity';
import { RecipeIngredient } from '../domain/recipe-ingredient.entity';
import {
  CycleDetectedError,
  DepthLimitError,
  RecipeGraph,
  RecipeNode,
  detectCycleFrom,
  isSelfReference,
} from './cycle-detector';

export interface CreateRecipeLineInput {
  ingredientId?: string | null;
  subRecipeId?: string | null;
  quantity: number;
  unitId: string;
  yieldPercentOverride?: number | null;
  sourceOverrideRef?: string | null;
}

export interface CreateRecipeInput {
  organizationId: string;
  name: string;
  description: string;
  notes?: string | null;
  wasteFactor: number;
  lines: CreateRecipeLineInput[];
}

export interface UpdateRecipeInput {
  name?: string;
  description?: string;
  notes?: string | null;
  wasteFactor?: number;
  /** When provided, replaces the full set of RecipeIngredient lines (transactional). */
  lines?: CreateRecipeLineInput[];
}

export class RecipeNotFoundError extends Error {
  readonly recipeId: string;
  constructor(recipeId: string) {
    super(`Recipe not found: ${recipeId}`);
    this.name = 'RecipeNotFoundError';
    this.recipeId = recipeId;
  }
}

export class RecipeInUseError extends Error {
  readonly recipeId: string;
  readonly menuItemNames: readonly string[];
  constructor(recipeId: string, menuItemNames: readonly string[]) {
    super(
      `Recipe ${recipeId} is referenced by ${menuItemNames.length} active MenuItem(s); soft-delete blocked`,
    );
    this.name = 'RecipeInUseError';
    this.recipeId = recipeId;
    this.menuItemNames = menuItemNames;
  }
}

export class RecipeIngredientNotFoundError extends Error {
  readonly recipeIngredientId: string;
  constructor(recipeIngredientId: string) {
    super(`RecipeIngredient not found: ${recipeIngredientId}`);
    this.name = 'RecipeIngredientNotFoundError';
    this.recipeIngredientId = recipeIngredientId;
  }
}

export interface RecipeWithLines {
  recipe: Recipe;
  lines: RecipeIngredient[];
  /** When the recipe is soft-deleted, callers can render `(Discontinued)` next to the name. */
  displayLabel: string | null;
}

@Injectable()
export class RecipesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly events: EventEmitter2,
  ) {}

  async create(input: CreateRecipeInput, actorUserId?: string): Promise<RecipeWithLines> {
    return this.dataSource.transaction(async (em) => {
      const recipe = Recipe.create({
        organizationId: input.organizationId,
        name: input.name,
        description: input.description,
        notes: input.notes,
        wasteFactor: input.wasteFactor,
      });
      if (actorUserId) {
        recipe.createdBy = actorUserId;
        recipe.updatedBy = actorUserId;
      }

      const subRecipeIds = input.lines
        .map((l) => l.subRecipeId ?? null)
        .filter((id): id is string => typeof id === 'string');

      // Self-reference (recipe.id is freshly minted; can only collide if the caller is misusing).
      const proposedNodes = await this.loadOrgNodesPlusProposed(em, input.organizationId, recipe);
      const selfHit = isSelfReference(recipe.id, subRecipeIds, proposedNodes);
      if (selfHit) throw new CycleDetectedError(selfHit);

      // Build the graph including the proposed recipe → its sub-recipes edge.
      const graph = await this.buildOrgGraph(em, input.organizationId);
      this.augmentGraphWithProposed(graph, recipe.id, subRecipeIds);

      const cycle = this.runDetect(recipe.id, graph, proposedNodes);
      if (cycle) throw new CycleDetectedError(cycle);

      const savedRecipe = await em.getRepository(Recipe).save(recipe);
      const lines = await this.persistLines(em, savedRecipe.id, input.lines, actorUserId);
      this.emitIngredientUpdated(savedRecipe.id, savedRecipe.organizationId);
      return { recipe: savedRecipe, lines, displayLabel: this.label(savedRecipe) };
    });
  }

  async findOne(organizationId: string, recipeId: string): Promise<RecipeWithLines> {
    const repoRecipe = this.dataSource.getRepository(Recipe);
    const repoLines = this.dataSource.getRepository(RecipeIngredient);
    const recipe = await repoRecipe.findOneBy({ id: recipeId, organizationId });
    if (!recipe) throw new RecipeNotFoundError(recipeId);
    const lines = await repoLines.findBy({ recipeId: recipe.id });
    return { recipe, lines, displayLabel: this.label(recipe) };
  }

  async findAll(
    organizationId: string,
    options: { selectableForSubRecipe?: boolean } = {},
  ): Promise<Recipe[]> {
    const where = options.selectableForSubRecipe
      ? { organizationId, isActive: true }
      : { organizationId };
    return this.dataSource.getRepository(Recipe).findBy(where);
  }

  async update(
    organizationId: string,
    recipeId: string,
    input: UpdateRecipeInput,
    actorUserId?: string,
  ): Promise<RecipeWithLines> {
    return this.dataSource.transaction(async (em) => {
      const repo = em.getRepository(Recipe);
      const recipe = await repo.findOneBy({ id: recipeId, organizationId });
      if (!recipe) throw new RecipeNotFoundError(recipeId);

      recipe.applyUpdate({
        name: input.name,
        description: input.description,
        notes: input.notes,
        wasteFactor: input.wasteFactor,
      });
      if (actorUserId) {
        recipe.updatedBy = actorUserId;
      }

      let lines: RecipeIngredient[];
      if (input.lines !== undefined) {
        // Cycle detection against the new graph: drop existing, plug proposed, walk.
        const subRecipeIds = input.lines
          .map((l) => l.subRecipeId ?? null)
          .filter((id): id is string => typeof id === 'string');

        const nodesById = await this.loadOrgNodesPlusProposed(em, organizationId, recipe);
        const selfHit = isSelfReference(recipe.id, subRecipeIds, nodesById);
        if (selfHit) throw new CycleDetectedError(selfHit);

        const graph = await this.buildOrgGraph(em, organizationId, recipe.id);
        this.augmentGraphWithProposed(graph, recipe.id, subRecipeIds);

        const cycle = this.runDetect(recipe.id, graph, nodesById);
        if (cycle) throw new CycleDetectedError(cycle);

        await em.getRepository(RecipeIngredient).delete({ recipeId: recipe.id });
        lines = await this.persistLines(em, recipe.id, input.lines, actorUserId);
      } else {
        lines = await em.getRepository(RecipeIngredient).findBy({ recipeId: recipe.id });
      }

      const saved = await repo.save(recipe);
      if (input.lines !== undefined) {
        this.emitIngredientUpdated(saved.id, saved.organizationId);
      }
      return { recipe: saved, lines, displayLabel: this.label(saved) };
    });
  }

  async updateLineSource(
    organizationId: string,
    recipeId: string,
    lineId: string,
    sourceOverrideRef: string | null,
    actorUserId?: string,
  ): Promise<RecipeIngredient> {
    return this.dataSource.transaction(async (em) => {
      const recipe = await em.getRepository(Recipe).findOneBy({ id: recipeId, organizationId });
      if (!recipe) throw new RecipeNotFoundError(recipeId);

      const lineRepo = em.getRepository(RecipeIngredient);
      const line = await lineRepo.findOneBy({ id: lineId, recipeId });
      if (!line) throw new RecipeIngredientNotFoundError(lineId);

      line.applyUpdate({ sourceOverrideRef });
      if (actorUserId) line.updatedBy = actorUserId;
      const saved = await lineRepo.save(line);

      const sourceEvent: AuditEventEnvelope<
        unknown,
        { recipeIngredientId: string; sourceOverrideRef: string | null }
      > = {
        organizationId,
        aggregateType: 'recipe',
        aggregateId: recipeId,
        actorUserId: null,
        actorKind: 'system',
        payloadAfter: {
          recipeIngredientId: saved.id,
          sourceOverrideRef: saved.sourceOverrideRef,
        },
      };
      this.events.emit(RECIPE_SOURCE_OVERRIDE_CHANGED, sourceEvent);

      return saved;
    });
  }

  async softDelete(organizationId: string, recipeId: string, actorUserId?: string): Promise<void> {
    await this.dataSource.transaction(async (em) => {
      const repo = em.getRepository(Recipe);
      const recipe = await repo.findOneBy({ id: recipeId, organizationId });
      if (!recipe) throw new RecipeNotFoundError(recipeId);

      const activeMenuItems = await em
        .getRepository(MenuItem)
        .findBy({ recipeId: recipe.id, isActive: true });
      if (activeMenuItems.length > 0) {
        // The repository doesn't carry MenuItem.name (no such column); use ids as labels.
        const labels = activeMenuItems.map((m) => `${m.channel}@${m.locationId}`);
        throw new RecipeInUseError(recipe.id, labels);
      }

      recipe.deactivate();
      if (actorUserId) recipe.updatedBy = actorUserId;
      await repo.save(recipe);
    });
  }

  // ------------------------------ helpers ------------------------------

  private emitIngredientUpdated(recipeId: string, organizationId: string): void {
    const event: AuditEventEnvelope<unknown, { recipeIngredientId: string }> = {
      organizationId,
      aggregateType: 'recipe',
      aggregateId: recipeId,
      actorUserId: null,
      actorKind: 'system',
      // line-level granularity is not needed for full-recipe recompute
      payloadAfter: { recipeIngredientId: recipeId },
    };
    this.events.emit(RECIPE_INGREDIENT_UPDATED, event);
  }

  private label(recipe: Recipe): string {
    return recipe.isActive ? recipe.name : `${recipe.name} (Discontinued)`;
  }

  private runDetect(
    startId: string,
    graph: RecipeGraph,
    nodesById: ReadonlyMap<string, RecipeNode>,
  ) {
    try {
      return detectCycleFrom(startId, graph, nodesById);
    } catch (err) {
      if (err instanceof DepthLimitError) {
        // Surface as a CycleHit-shaped error so the controller maps it to 422.
        throw new CycleDetectedError({
          code: 'CYCLE',
          node1Id: err.path[0] ?? startId,
          node1Name: nodesById.get(err.path[0] ?? startId)?.name ?? startId,
          node2Id: err.path[err.path.length - 1] ?? startId,
          node2Name: nodesById.get(err.path[err.path.length - 1] ?? startId)?.name ?? startId,
          direction: err.path.map((id) => nodesById.get(id)?.name ?? id).join(' -> '),
        });
      }
      throw err;
    }
  }

  private async buildOrgGraph(
    em: EntityManager,
    organizationId: string,
    excludeRecipeId?: string,
  ): Promise<Map<string, Set<string>>> {
    const recipes = await em.getRepository(Recipe).findBy({ organizationId });
    const recipeIds = new Set(recipes.map((r) => r.id));
    if (excludeRecipeId) recipeIds.delete(excludeRecipeId);

    if (recipeIds.size === 0) return new Map();

    const lines = await em
      .getRepository(RecipeIngredient)
      .findBy({ recipeId: In([...recipeIds]), subRecipeId: Not(IsNull()) });

    const graph = new Map<string, Set<string>>();
    for (const line of lines) {
      if (line.subRecipeId === null) continue;
      const set = graph.get(line.recipeId) ?? new Set<string>();
      set.add(line.subRecipeId);
      graph.set(line.recipeId, set);
    }
    return graph;
  }

  private augmentGraphWithProposed(
    graph: Map<string, Set<string>>,
    recipeId: string,
    subRecipeIds: readonly string[],
  ): void {
    if (subRecipeIds.length === 0) return;
    graph.set(recipeId, new Set(subRecipeIds));
  }

  private async loadOrgNodesPlusProposed(
    em: EntityManager,
    organizationId: string,
    proposed: Recipe,
  ): Promise<Map<string, RecipeNode>> {
    const recipes = await em.getRepository(Recipe).findBy({ organizationId });
    const m = new Map<string, RecipeNode>();
    for (const r of recipes) m.set(r.id, { id: r.id, name: r.name });
    m.set(proposed.id, { id: proposed.id, name: proposed.name });
    return m;
  }

  private async persistLines(
    em: EntityManager,
    recipeId: string,
    lines: readonly CreateRecipeLineInput[],
    actorUserId?: string,
  ): Promise<RecipeIngredient[]> {
    const rows = lines.map((l) =>
      RecipeIngredient.create({
        recipeId,
        ingredientId: l.ingredientId ?? null,
        subRecipeId: l.subRecipeId ?? null,
        quantity: l.quantity,
        unitId: l.unitId,
        yieldPercentOverride: l.yieldPercentOverride ?? null,
        sourceOverrideRef: l.sourceOverrideRef ?? null,
      }),
    );
    if (actorUserId) {
      for (const r of rows) {
        r.createdBy = actorUserId;
        r.updatedBy = actorUserId;
      }
    }
    return em.getRepository(RecipeIngredient).save(rows);
  }
}
