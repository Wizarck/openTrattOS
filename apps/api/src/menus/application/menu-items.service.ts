import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryFailedError } from 'typeorm';
import { CostService, CostRecipeNotFoundError } from '../../cost/application/cost.service';
import { Location } from '../../iam/domain/location.entity';
import { Recipe } from '../../recipes/domain/recipe.entity';
import { RecipeRepository } from '../../recipes/infrastructure/recipe.repository';
import { MenuItem, MenuItemChannel } from '../domain/menu-item.entity';
import { MenuItemRepository } from '../infrastructure/menu-item.repository';

export interface CreateMenuItemInput {
  organizationId: string;
  recipeId: string;
  locationId: string;
  channel: MenuItemChannel;
  sellingPrice: number;
  targetMargin: number;
}

export interface UpdateMenuItemInput {
  channel?: MenuItemChannel;
  sellingPrice?: number;
  targetMargin?: number;
}

export interface MenuItemView {
  menuItem: MenuItem;
  /** "<Recipe.name> (Discontinued)" when the parent recipe is soft-deleted; otherwise the recipe name. */
  displayLabel: string;
  /** True when the parent Recipe is soft-deleted; UI surfaces a discontinued badge. */
  recipeDiscontinued: boolean;
}

export type MarginStatus = 'on_target' | 'below_target' | 'at_risk' | 'unknown';

export interface MarginReport {
  menuItemId: string;
  organizationId: string;
  recipeId: string;
  locationId: string;
  channel: MenuItemChannel;
  /** Live cost from CostService.computeRecipeCost; null when unresolved. */
  cost: number | null;
  sellingPrice: number;
  targetMargin: number;
  /** sellingPrice − cost; null when cost is null. */
  marginAbsolute: number | null;
  /** marginAbsolute / sellingPrice, in [0, 1); null when cost is null. */
  marginPercent: number | null;
  /** Δ vs target (marginPercent − targetMargin), expressed as percentage points; null when cost is null. */
  marginVsTargetPp: number | null;
  status: MarginStatus;
  /** Human-readable status label paired with `status` per ADR-016 (never colour-only). */
  statusLabel: string;
  /** Operational warning when cost is unresolved — empty array on the happy path. */
  warnings: string[];
  /** Hint for UI: render Discontinued badge alongside the margin panel. */
  recipeDiscontinued: boolean;
  currency: string;
}

export class MenuItemNotFoundError extends Error {
  readonly menuItemId: string;
  constructor(menuItemId: string) {
    super(`MenuItem not found: ${menuItemId}`);
    this.name = 'MenuItemNotFoundError';
    this.menuItemId = menuItemId;
  }
}

export class MenuItemRecipeNotFoundError extends Error {
  readonly recipeId: string;
  constructor(recipeId: string) {
    super(`MenuItem references missing Recipe: ${recipeId}`);
    this.name = 'MenuItemRecipeNotFoundError';
    this.recipeId = recipeId;
  }
}

export class MenuItemLocationNotFoundError extends Error {
  readonly locationId: string;
  constructor(locationId: string) {
    super(`MenuItem references missing Location: ${locationId}`);
    this.name = 'MenuItemLocationNotFoundError';
    this.locationId = locationId;
  }
}

export class MenuItemDuplicateError extends Error {
  readonly recipeId: string;
  readonly locationId: string;
  readonly channel: MenuItemChannel;
  constructor(recipeId: string, locationId: string, channel: MenuItemChannel) {
    super(
      `Active MenuItem already exists for recipe=${recipeId} location=${locationId} channel=${channel}`,
    );
    this.name = 'MenuItemDuplicateError';
    this.recipeId = recipeId;
    this.locationId = locationId;
    this.channel = channel;
  }
}

const STATUS_LABELS: Record<MarginStatus, string> = {
  on_target: 'On target',
  below_target: 'Below target',
  at_risk: 'At risk',
  unknown: 'Cost unknown',
};

const AT_RISK_THRESHOLD_PP = 0.05; // 5 percentage points per ADR-016

@Injectable()
export class MenuItemsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly menuItems: MenuItemRepository,
    private readonly recipes: RecipeRepository,
    private readonly cost: CostService,
  ) {}

  async create(input: CreateMenuItemInput, actorUserId?: string): Promise<MenuItemView> {
    return this.dataSource.transaction(async (em) => {
      const recipe = await em
        .getRepository(Recipe)
        .findOneBy({ id: input.recipeId, organizationId: input.organizationId });
      if (!recipe) throw new MenuItemRecipeNotFoundError(input.recipeId);

      const location = await em
        .getRepository(Location)
        .findOneBy({ id: input.locationId, organizationId: input.organizationId });
      if (!location) throw new MenuItemLocationNotFoundError(input.locationId);

      const m = MenuItem.create({
        organizationId: input.organizationId,
        recipeId: input.recipeId,
        locationId: input.locationId,
        channel: input.channel,
        sellingPrice: input.sellingPrice,
        targetMargin: input.targetMargin,
      });
      if (actorUserId) {
        m.createdBy = actorUserId;
        m.updatedBy = actorUserId;
      }

      try {
        const saved = await em.getRepository(MenuItem).save(m);
        return this.toView(saved);
      } catch (err) {
        if (
          err instanceof QueryFailedError &&
          /uq_menu_items_active_recipe_location_channel/.test(err.message)
        ) {
          throw new MenuItemDuplicateError(input.recipeId, input.locationId, input.channel);
        }
        throw err;
      }
    });
  }

  async findOne(organizationId: string, id: string): Promise<MenuItemView> {
    const m = await this.menuItems.findOneBy({ id, organizationId });
    if (!m) throw new MenuItemNotFoundError(id);
    return this.toView(m);
  }

  async findAll(
    organizationId: string,
    filter: { locationId?: string; channel?: MenuItemChannel; isActive?: boolean } = {},
  ): Promise<MenuItemView[]> {
    const where: Record<string, unknown> = { organizationId };
    if (filter.locationId) where.locationId = filter.locationId;
    if (filter.channel) where.channel = filter.channel;
    if (filter.isActive !== undefined) where.isActive = filter.isActive;
    const rows = await this.menuItems.findBy(where);
    const views: MenuItemView[] = [];
    for (const m of rows) views.push(await this.toView(m));
    return views;
  }

  async update(
    organizationId: string,
    id: string,
    input: UpdateMenuItemInput,
    actorUserId?: string,
  ): Promise<MenuItemView> {
    return this.dataSource.transaction(async (em) => {
      const repo = em.getRepository(MenuItem);
      const m = await repo.findOneBy({ id, organizationId });
      if (!m) throw new MenuItemNotFoundError(id);

      m.applyUpdate({
        channel: input.channel,
        sellingPrice: input.sellingPrice,
        targetMargin: input.targetMargin,
      });
      if (actorUserId) m.updatedBy = actorUserId;

      try {
        const saved = await repo.save(m);
        return this.toView(saved);
      } catch (err) {
        if (
          err instanceof QueryFailedError &&
          /uq_menu_items_active_recipe_location_channel/.test(err.message)
        ) {
          throw new MenuItemDuplicateError(m.recipeId, m.locationId, m.channel);
        }
        throw err;
      }
    });
  }

  async softDelete(organizationId: string, id: string, actorUserId?: string): Promise<void> {
    await this.dataSource.transaction(async (em) => {
      const repo = em.getRepository(MenuItem);
      const m = await repo.findOneBy({ id, organizationId });
      if (!m) throw new MenuItemNotFoundError(id);
      m.deactivate();
      if (actorUserId) m.updatedBy = actorUserId;
      await repo.save(m);
    });
  }

  /**
   * Computes the live margin for a single MenuItem. Calls CostService for the
   * underlying recipe cost; gracefully degrades to `status='unknown'` when the
   * cost is unresolvable (no preferred SupplierItem for some ingredient,
   * Recipe vanished mid-call, etc.) — never 5xx.
   */
  async getMargin(organizationId: string, id: string): Promise<MarginReport> {
    const m = await this.menuItems.findOneBy({ id, organizationId });
    if (!m) throw new MenuItemNotFoundError(id);

    const sellingPrice = Number(m.sellingPrice);
    const targetMargin = Number(m.targetMargin);
    const warnings: string[] = [];
    const recipe = await this.recipes.findOneBy({ id: m.recipeId, organizationId });
    const recipeDiscontinued = !!recipe && recipe.isActive === false;

    let cost: number | null = null;
    let currency = 'EUR';
    try {
      const breakdown = await this.cost.computeRecipeCost(organizationId, m.recipeId);
      currency = breakdown.currency;
      const anyUnresolved = breakdown.components.some((c) => c.unresolved);
      if (anyUnresolved) {
        warnings.push(
          'cost_unresolved: at least one ingredient has no preferred SupplierItem; margin shown as unknown',
        );
      } else {
        cost = breakdown.totalCost;
      }
    } catch (err) {
      if (err instanceof CostRecipeNotFoundError) {
        warnings.push('cost_recipe_not_found: parent recipe is missing');
      } else if (err instanceof Error) {
        warnings.push(`cost_error: ${err.message}`);
      } else {
        warnings.push('cost_error: unknown failure');
      }
    }

    const marginAbsolute = cost === null ? null : round4(sellingPrice - cost);
    const marginPercent =
      cost === null || sellingPrice <= 0 ? null : round4(marginAbsolute! / sellingPrice);
    const marginVsTargetPp = marginPercent === null ? null : round4(marginPercent - targetMargin);

    const status = MenuItemsService.classify(marginVsTargetPp);

    return {
      menuItemId: m.id,
      organizationId: m.organizationId,
      recipeId: m.recipeId,
      locationId: m.locationId,
      channel: m.channel,
      cost,
      sellingPrice,
      targetMargin,
      marginAbsolute,
      marginPercent,
      marginVsTargetPp,
      status,
      statusLabel: STATUS_LABELS[status],
      warnings,
      recipeDiscontinued,
      currency,
    };
  }

  /**
   * Pure classifier for status thresholds (ADR-016):
   *   green  / on_target    → marginVsTargetPp >= 0
   *   amber  / below_target → marginVsTargetPp ∈ [-0.05, 0)
   *   red    / at_risk      → marginVsTargetPp < -0.05
   *   gray   / unknown      → no resolvable cost
   */
  static classify(marginVsTargetPp: number | null): MarginStatus {
    if (marginVsTargetPp === null) return 'unknown';
    if (marginVsTargetPp >= 0) return 'on_target';
    if (marginVsTargetPp >= -AT_RISK_THRESHOLD_PP) return 'below_target';
    return 'at_risk';
  }

  // ------------------------------ helpers ------------------------------

  private async toView(m: MenuItem): Promise<MenuItemView> {
    const recipe = await this.recipes.findOneBy({ id: m.recipeId, organizationId: m.organizationId });
    const recipeName = recipe?.name ?? '<missing recipe>';
    const recipeDiscontinued = !!recipe && recipe.isActive === false;
    const displayLabel = recipeDiscontinued ? `${recipeName} (Discontinued)` : recipeName;
    return { menuItem: m, displayLabel, recipeDiscontinued };
  }
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
