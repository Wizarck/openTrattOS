import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull } from 'typeorm';
import { Ingredient } from '../../ingredients/domain/ingredient.entity';
import { convert } from '../../ingredients/domain/uom/convert';
import { findUnit } from '../../ingredients/domain/uom/units';
import { Recipe } from '../../recipes/domain/recipe.entity';
import { RecipeIngredient } from '../../recipes/domain/recipe-ingredient.entity';
import { foldRecipeTree } from '../../recipes/application/recipe-tree-walker';
import {
  INVENTORY_COST_RESOLVER,
  InventoryCostResolver,
  NoCostSourceError,
} from '../inventory-cost-resolver';
import { CostChangeReason, RecipeCostHistory } from '../domain/recipe-cost-history.entity';
import { RecipeCostHistoryRepository } from '../infrastructure/recipe-cost-history.repository';
import {
  RECIPE_INGREDIENT_UPDATED,
  RECIPE_SOURCE_OVERRIDE_CHANGED,
  RecipeIngredientUpdatedEvent,
  RecipeSourceOverrideChangedEvent,
  SUB_RECIPE_COST_CHANGED,
  SUPPLIER_PRICE_UPDATED,
  SubRecipeCostChangedEvent,
  SupplierPriceUpdatedEvent,
} from './cost.events';

/**
 * Per-component contribution to a recipe's cost, with attribution chain so
 * the "what changed?" view (Journey 2) can render the responsible source.
 */
export interface CostBreakdownComponent {
  recipeIngredientId: string;
  componentKind: 'ingredient' | 'sub-recipe';
  componentId: string;
  /** Display name of the ingredient or sub-recipe (snapshot, not live). */
  componentName: string;
  /** Quantity expressed in the line's unit. */
  quantity: number;
  /** Line UoM code (e.g. "kg", "ml", "pcs"). */
  unitId: string;
  /** Cost per single base unit (€/g, €/ml, €/pcs). 0 for sub-recipe lines (totalised differently). */
  costPerBaseUnit: number;
  /** Effective yield used in the rollup (line override or default 1.0). */
  yield: number;
  /** Effective waste factor used (parent recipe's wasteFactor). */
  wasteFactor: number;
  /**
   * Final cost contribution for this line:
   *   ingredient: qtyInBase × costPerBaseUnit × yield × (1 − waste)
   *   sub-recipe: subRecipeTotal × quantity × yield × (1 − waste)
   */
  lineCost: number;
  /** Source ref + label (SupplierItem or sub-recipe id); null on resolution failure. */
  sourceRefId: string | null;
  sourceLabel: string | null;
  /** True when no cost source resolved (NO_SOURCE) — the line contributed 0 to the total. */
  unresolved: boolean;
}

export interface CostBreakdown {
  recipeId: string;
  recipeName: string;
  totalCost: number;
  currency: string;
  components: CostBreakdownComponent[];
  /** When >0.0001 (>0.01 % of totalCost), `roundingDelta` flags a rollup precision warning. */
  roundingDelta: number;
}

export interface CostDeltaComponent {
  recipeIngredientId: string;
  componentKind: 'ingredient' | 'sub-recipe';
  componentId: string;
  componentName: string;
  costFrom: number;
  costTo: number;
  delta: number;
  sourceRefIdFrom: string | null;
  sourceRefIdTo: string | null;
}

export interface CostDelta {
  recipeId: string;
  from: Date;
  to: Date;
  totalFrom: number;
  totalTo: number;
  totalDelta: number;
  components: CostDeltaComponent[];
}

const DEFAULT_HISTORY_WINDOW_DAYS = 14;
const ROLLUP_TOLERANCE = 0.0001; // 0.01 % per ADR-016
const FAMILY_BASE_UNIT: Record<'WEIGHT' | 'VOLUME' | 'UNIT', string> = {
  WEIGHT: 'g',
  VOLUME: 'ml',
  UNIT: 'pcs',
};

export class CostRecipeNotFoundError extends Error {
  readonly recipeId: string;
  constructor(recipeId: string) {
    super(`Recipe not found for cost computation: ${recipeId}`);
    this.name = 'CostRecipeNotFoundError';
    this.recipeId = recipeId;
  }
}

@Injectable()
export class CostService {
  private readonly logger = new Logger(CostService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(INVENTORY_COST_RESOLVER) private readonly resolver: InventoryCostResolver,
    private readonly history: RecipeCostHistoryRepository,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Walks the sub-recipe tree of `recipeId`, calling `resolver.resolveBaseCost`
   * for each ingredient line. Pure read-time computation — does not persist
   * anything. Emits no events. Use `appendHistory()` separately to record.
   */
  async computeRecipeCost(organizationId: string, recipeId: string): Promise<CostBreakdown> {
    return this.computeWithEm(this.dataSource.manager, organizationId, recipeId);
  }

  private async computeWithEm(
    em: EntityManager,
    organizationId: string,
    recipeId: string,
  ): Promise<CostBreakdown> {
    const rootRecipe = await em.getRepository(Recipe).findOneBy({ id: recipeId, organizationId });
    if (!rootRecipe) throw new CostRecipeNotFoundError(recipeId);

    return foldRecipeTree<CostBreakdown>(
      em,
      organizationId,
      recipeId,
      async ({ recipe, lines, subResults }) => this.foldNode(em, recipe, lines, subResults),
      { onMissingSubRecipe: 'skip' },
    );
  }

  private async foldNode(
    em: EntityManager,
    recipe: Recipe,
    lines: RecipeIngredient[],
    subResults: Map<string, CostBreakdown>,
  ): Promise<CostBreakdown> {
    const ingredientIds = lines
      .map((l) => l.ingredientId)
      .filter((id): id is string => id !== null);
    const ingredients =
      ingredientIds.length === 0
        ? []
        : await em.getRepository(Ingredient).findBy({ id: In(ingredientIds) });
    const ingredientById = new Map(ingredients.map((i) => [i.id, i]));

    const wasteEff = Number(recipe.wasteFactor);
    const components: CostBreakdownComponent[] = [];
    let runningTotal = 0;
    let currency: string | null = null;

    for (const line of lines) {
      const yieldEff = Number(line.yieldPercentOverride ?? 1);

      if (line.ingredientId) {
        const ingredient = ingredientById.get(line.ingredientId);
        if (!ingredient) {
          components.push(
            this.unresolvedComponent(line, 'ingredient', line.ingredientId, '<missing>', yieldEff, wasteEff),
          );
          continue;
        }
        try {
          const resolved = await this.resolver.resolveBaseCost(line.ingredientId, {
            sourceOverrideRef: line.sourceOverrideRef,
          });
          if (currency === null) currency = resolved.currency;
          const qtyInBase = this.toBaseQty(line.quantity, line.unitId, ingredient);
          const lineCost = round4(
            qtyInBase * resolved.costPerBaseUnit * yieldEff * (1 - wasteEff),
          );
          components.push({
            recipeIngredientId: line.id,
            componentKind: 'ingredient',
            componentId: ingredient.id,
            componentName: ingredient.name,
            quantity: Number(line.quantity),
            unitId: line.unitId,
            costPerBaseUnit: resolved.costPerBaseUnit,
            yield: yieldEff,
            wasteFactor: wasteEff,
            lineCost,
            sourceRefId: resolved.source.refId,
            sourceLabel: resolved.source.displayLabel,
            unresolved: false,
          });
          runningTotal += lineCost;
        } catch (err) {
          if (err instanceof NoCostSourceError) {
            components.push(
              this.unresolvedComponent(
                line,
                'ingredient',
                ingredient.id,
                ingredient.name,
                yieldEff,
                wasteEff,
              ),
            );
            continue;
          }
          throw err;
        }
        continue;
      }

      if (line.subRecipeId) {
        const subBreakdown = subResults.get(line.subRecipeId);
        if (!subBreakdown) {
          // Missing or skipped sub-recipe (cycle-detector + FK should normally prevent this).
          components.push(
            this.unresolvedComponent(line, 'sub-recipe', line.subRecipeId, '<missing>', yieldEff, wasteEff),
          );
          continue;
        }
        if (currency === null) currency = subBreakdown.currency;
        const lineCost = round4(
          subBreakdown.totalCost * Number(line.quantity) * yieldEff * (1 - wasteEff),
        );
        components.push({
          recipeIngredientId: line.id,
          componentKind: 'sub-recipe',
          componentId: subBreakdown.recipeId,
          componentName: subBreakdown.recipeName,
          quantity: Number(line.quantity),
          unitId: line.unitId,
          costPerBaseUnit: 0,
          yield: yieldEff,
          wasteFactor: wasteEff,
          lineCost,
          sourceRefId: subBreakdown.recipeId,
          sourceLabel: subBreakdown.recipeName,
          unresolved: false,
        });
        runningTotal += lineCost;
      }
    }

    const totalCost = round4(runningTotal);
    const roundingDelta = Math.abs(totalCost - runningTotal);
    if (roundingDelta > ROLLUP_TOLERANCE) {
      this.logger.warn(
        `Recipe ${recipe.id} rollup tolerance exceeded: delta=${roundingDelta}, total=${totalCost}`,
      );
    }

    return {
      recipeId: recipe.id,
      recipeName: recipe.name,
      totalCost,
      currency: currency ?? 'EUR',
      components,
      roundingDelta,
    };
  }

  private unresolvedComponent(
    line: RecipeIngredient,
    kind: 'ingredient' | 'sub-recipe',
    componentId: string,
    componentName: string,
    yieldEff: number,
    wasteEff: number,
  ): CostBreakdownComponent {
    return {
      recipeIngredientId: line.id,
      componentKind: kind,
      componentId,
      componentName,
      quantity: Number(line.quantity),
      unitId: line.unitId,
      costPerBaseUnit: 0,
      yield: yieldEff,
      wasteFactor: wasteEff,
      lineCost: 0,
      sourceRefId: null,
      sourceLabel: null,
      unresolved: true,
    };
  }

  private toBaseQty(quantity: number, unitId: string, ingredient: Ingredient): number {
    const lineUnit = findUnit(unitId);
    if (!lineUnit) {
      throw new Error(`CostService: unknown line unit "${unitId}"`);
    }
    const baseUnit = FAMILY_BASE_UNIT[ingredient.baseUnitType];
    if (lineUnit.family === ingredient.baseUnitType) {
      return convert(Number(quantity), unitId, baseUnit);
    }
    if (ingredient.densityFactor) {
      return convert(Number(quantity), unitId, baseUnit, ingredient.densityFactor);
    }
    throw new Error(
      `CostService: line unit "${unitId}" (${lineUnit.family}) cannot be converted to ingredient base unit "${baseUnit}" (${ingredient.baseUnitType}) without densityFactor`,
    );
  }

  /**
   * Returns history rows in the requested window. Defaults to the last 14d
   * per design.md §"Default window 14d vs 7d/30d".
   */
  async getHistory(
    organizationId: string,
    recipeId: string,
    windowDays: number = DEFAULT_HISTORY_WINDOW_DAYS,
  ): Promise<RecipeCostHistory[]> {
    const recipe = await this.dataSource.getRepository(Recipe).findOneBy({ id: recipeId, organizationId });
    if (!recipe) throw new CostRecipeNotFoundError(recipeId);
    const to = new Date();
    const from = new Date(to.getTime() - windowDays * 24 * 60 * 60 * 1000);
    return this.history.findInWindow(recipeId, from, to);
  }

  /**
   * Returns per-component delta between two timestamps. The "from" snapshot is
   * the latest `INITIAL`-or-recent row at-or-before `from`; the "to" snapshot
   * is the latest row at-or-before `to`. Components present in only one
   * snapshot show `costFrom=0` or `costTo=0` and the full delta.
   */
  async computeCostDelta(
    organizationId: string,
    recipeId: string,
    from: Date,
    to: Date,
  ): Promise<CostDelta> {
    const recipe = await this.dataSource.getRepository(Recipe).findOneBy({ id: recipeId, organizationId });
    if (!recipe) throw new CostRecipeNotFoundError(recipeId);
    if (from > to) throw new Error('CostService: from must be <= to');

    const rows = await this.history.findInWindow(recipeId, new Date(0), to);

    type Snapshot = {
      total: number;
      perComponent: Map<string, { cost: number; sourceRefId: string | null }>;
    };
    const buildSnapshotAt = (boundary: Date): Snapshot => {
      const snapshot: Snapshot = { total: 0, perComponent: new Map() };
      for (const row of rows) {
        if (row.computedAt > boundary) continue;
        if (row.componentRefId === null) {
          snapshot.total = Number(row.totalCost);
        } else {
          snapshot.perComponent.set(row.componentRefId, {
            cost: Number(row.totalCost),
            sourceRefId: row.sourceRefId,
          });
        }
      }
      return snapshot;
    };
    const fromSnap = buildSnapshotAt(from);
    const toSnap = buildSnapshotAt(to);

    const allKeys = new Set<string>();
    for (const k of fromSnap.perComponent.keys()) allKeys.add(k);
    for (const k of toSnap.perComponent.keys()) allKeys.add(k);

    const lineEntities = await this.dataSource
      .getRepository(RecipeIngredient)
      .findBy({ id: In([...allKeys]) });
    const lineById = new Map(lineEntities.map((l) => [l.id, l]));

    const ingredientIds = lineEntities.map((l) => l.ingredientId).filter((id): id is string => !!id);
    const subRecipeIds = lineEntities.map((l) => l.subRecipeId).filter((id): id is string => !!id);
    const [ingredients, subRecipes] = await Promise.all([
      ingredientIds.length === 0
        ? Promise.resolve<Ingredient[]>([])
        : this.dataSource.getRepository(Ingredient).findBy({ id: In(ingredientIds) }),
      subRecipeIds.length === 0
        ? Promise.resolve<Recipe[]>([])
        : this.dataSource.getRepository(Recipe).findBy({ id: In(subRecipeIds) }),
    ]);
    const ingredientById = new Map(ingredients.map((i) => [i.id, i]));
    const subRecipeById = new Map(subRecipes.map((r) => [r.id, r]));

    const components: CostDeltaComponent[] = [];
    for (const lineId of allKeys) {
      const a = fromSnap.perComponent.get(lineId);
      const b = toSnap.perComponent.get(lineId);
      const line = lineById.get(lineId);
      const kind: 'ingredient' | 'sub-recipe' = line?.subRecipeId ? 'sub-recipe' : 'ingredient';
      const componentId = (line?.ingredientId ?? line?.subRecipeId) ?? lineId;
      const componentName =
        kind === 'ingredient'
          ? ingredientById.get(componentId)?.name ?? '<missing>'
          : subRecipeById.get(componentId)?.name ?? '<missing>';
      const costFrom = a?.cost ?? 0;
      const costTo = b?.cost ?? 0;
      components.push({
        recipeIngredientId: lineId,
        componentKind: kind,
        componentId,
        componentName,
        costFrom,
        costTo,
        delta: round4(costTo - costFrom),
        sourceRefIdFrom: a?.sourceRefId ?? null,
        sourceRefIdTo: b?.sourceRefId ?? null,
      });
    }
    components.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));

    return {
      recipeId,
      from,
      to,
      totalFrom: fromSnap.total,
      totalTo: toSnap.total,
      totalDelta: round4(toSnap.total - fromSnap.total),
      components,
    };
  }

  /**
   * Recomputes the cost for `recipeId`, persists a history row per component
   * + a totals row, and emits a `SUB_RECIPE_COST_CHANGED` event so parents
   * cascade. Returns the fresh breakdown.
   */
  async recordSnapshot(
    organizationId: string,
    recipeId: string,
    reason: CostChangeReason,
  ): Promise<CostBreakdown> {
    return this.dataSource.transaction(async (em) => {
      const breakdown = await this.computeWithEm(em, organizationId, recipeId);
      const rows: RecipeCostHistory[] = [];
      for (const c of breakdown.components) {
        rows.push(
          RecipeCostHistory.create({
            recipeId,
            organizationId,
            componentRefId: c.recipeIngredientId,
            costPerBaseUnit: c.costPerBaseUnit,
            totalCost: c.lineCost,
            sourceRefId: c.sourceRefId,
            reason,
          }),
        );
      }
      // Totals row (componentRefId NULL) drives delta queries' `total`.
      rows.push(
        RecipeCostHistory.create({
          recipeId,
          organizationId,
          componentRefId: null,
          costPerBaseUnit: 0,
          totalCost: breakdown.totalCost,
          sourceRefId: null,
          reason,
        }),
      );
      await em.getRepository(RecipeCostHistory).save(rows);

      this.events.emit(SUB_RECIPE_COST_CHANGED, {
        subRecipeId: recipeId,
        organizationId,
      } satisfies SubRecipeCostChangedEvent);

      return breakdown;
    });
  }

  // ----------------------------- event handlers -----------------------------

  @OnEvent(SUPPLIER_PRICE_UPDATED)
  async onSupplierPriceUpdated(evt: SupplierPriceUpdatedEvent): Promise<void> {
    const recipeIds = await this.recipesUsingIngredient(evt.organizationId, evt.ingredientId);
    for (const id of recipeIds) {
      try {
        await this.recordSnapshot(evt.organizationId, id, 'SUPPLIER_PRICE_CHANGE');
      } catch (err) {
        this.logger.warn(`Recompute failed for recipe ${id} after supplier price update: ${err}`);
      }
    }
  }

  @OnEvent(RECIPE_INGREDIENT_UPDATED)
  async onRecipeIngredientUpdated(evt: RecipeIngredientUpdatedEvent): Promise<void> {
    try {
      await this.recordSnapshot(evt.organizationId, evt.recipeId, 'LINE_EDIT');
    } catch (err) {
      this.logger.warn(`Recompute failed for recipe ${evt.recipeId} after line edit: ${err}`);
    }
  }

  @OnEvent(RECIPE_SOURCE_OVERRIDE_CHANGED)
  async onRecipeSourceOverrideChanged(evt: RecipeSourceOverrideChangedEvent): Promise<void> {
    try {
      await this.recordSnapshot(evt.organizationId, evt.recipeId, 'SOURCE_OVERRIDE');
    } catch (err) {
      this.logger.warn(`Recompute failed for recipe ${evt.recipeId} after source override: ${err}`);
    }
  }

  @OnEvent(SUB_RECIPE_COST_CHANGED)
  async onSubRecipeCostChanged(evt: SubRecipeCostChangedEvent): Promise<void> {
    const parentIds = await this.parentRecipesOf(evt.organizationId, evt.subRecipeId);
    for (const id of parentIds) {
      if (id === evt.subRecipeId) continue; // self-emission guard
      try {
        await this.recordSnapshot(evt.organizationId, id, 'SUB_RECIPE_CHANGE');
      } catch (err) {
        this.logger.warn(`Recompute failed for parent recipe ${id} on sub-recipe cascade: ${err}`);
      }
    }
  }

  private async recipesUsingIngredient(
    organizationId: string,
    ingredientId: string,
  ): Promise<string[]> {
    const lines = await this.dataSource
      .getRepository(RecipeIngredient)
      .findBy({ ingredientId });
    if (lines.length === 0) return [];
    const recipes = await this.dataSource
      .getRepository(Recipe)
      .findBy({ id: In(lines.map((l) => l.recipeId)), organizationId });
    return recipes.map((r) => r.id);
  }

  private async parentRecipesOf(organizationId: string, subRecipeId: string): Promise<string[]> {
    const lines = await this.dataSource
      .getRepository(RecipeIngredient)
      .findBy({ subRecipeId, ingredientId: IsNull() });
    if (lines.length === 0) return [];
    const recipes = await this.dataSource
      .getRepository(Recipe)
      .findBy({ id: In(lines.map((l) => l.recipeId)), organizationId });
    return recipes.map((r) => r.id);
  }
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
