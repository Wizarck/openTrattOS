import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  INGREDIENT_OVERRIDE_CHANGED,
  IngredientOverrideChangedEvent,
} from '../../cost/application/cost.events';
import { ExternalCatalogService } from '../../external-catalog/application/external-catalog.service';
import { ExternalFoodCatalog } from '../../external-catalog/domain/external-food-catalog.entity';
import {
  RecipeTreeRecipeNotFoundError,
  walkRecipeTree,
} from '../../recipes/application/recipe-tree-walker';
import {
  Ingredient,
  IngredientOverridableField,
  OVERRIDABLE_FIELDS,
} from '../domain/ingredient.entity';
import { IngredientRepository } from '../infrastructure/ingredient.repository';

export const MIN_OVERRIDE_REASON_LENGTH = 10;

export interface PrefillFromOffResult {
  /** Suggested fields for `Ingredient.create({ ... })`. Caller chooses to apply. */
  brandName: string | null;
  externalSourceRef: string;
  nutrition: Record<string, unknown> | null;
  allergens: string[];
  dietFlags: string[];
}

export interface ApplyOverrideInput {
  organizationId: string;
  actorUserId: string;
  ingredientId: string;
  field: IngredientOverridableField;
  value: unknown;
  reason: string;
}

export interface MacroTotals {
  /** Per-portion totals (no scaling). Sums of `nutrition × scaledQuantity × cumulativeYieldWaste`. */
  perPortion: Record<string, number>;
  /** Per-100g view derived from the perPortion totals when total weight > 0. */
  per100g: Record<string, number>;
  /** Total weight (g) if computable from leaf scaledQuantity in WEIGHT base units; null otherwise. */
  totalWeightG: number | null;
  /** Set of `(ingredientId, externalSourceRef)` pairs for ODbL attribution rendering. */
  externalSources: Array<{ ingredientId: string; externalSourceRef: string }>;
}

export class IngredientNotFoundError extends Error {
  readonly ingredientId: string;
  constructor(ingredientId: string) {
    super(`Ingredient not found: ${ingredientId}`);
    this.name = 'IngredientNotFoundError';
    this.ingredientId = ingredientId;
  }
}

export class IngredientOverrideReasonError extends Error {
  readonly minLength: number;
  constructor(minLength: number) {
    super(`Override reason must be at least ${minLength} characters`);
    this.name = 'IngredientOverrideReasonError';
    this.minLength = minLength;
  }
}

export class IngredientOverrideUnknownFieldError extends Error {
  readonly field: string;
  constructor(field: string) {
    super(`Unknown overridable field: ${field}`);
    this.name = 'IngredientOverrideUnknownFieldError';
    this.field = field;
  }
}

/**
 * M2-extension service hosting the OFF-search + prefill + override + macro-
 * rollup logic. The legacy CRUD endpoints continue to use the repository
 * directly; this service is opt-in for the new flows so M1's contract stays
 * stable.
 */
@Injectable()
export class IngredientsService {
  private readonly logger = new Logger(IngredientsService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly ingredients: IngredientRepository,
    private readonly externalCatalog: ExternalCatalogService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Cache-first OFF lookup by barcode. Returns null on outage (per #4's
   * graceful-degrade behavior). The caller decides whether to render an
   * empty state or fall through to local-only search.
   */
  async searchByBarcode(barcode: string, region = 'eu'): Promise<ExternalFoodCatalog | null> {
    return this.externalCatalog.searchByBarcode(barcode, { region });
  }

  /**
   * Pure mapping from an OFF catalog row to the `IngredientCreateProps`
   * extension fields. The caller still calls `Ingredient.create({ ... })`
   * with name + categoryId + baseUnitType; this just prepares the OFF-pulled
   * fields they may want to apply.
   */
  prefillFromOff(catalogRow: ExternalFoodCatalog): PrefillFromOffResult {
    return {
      brandName: catalogRow.brand,
      externalSourceRef: catalogRow.barcode,
      nutrition: catalogRow.nutrition as Record<string, unknown> | null,
      allergens: [...catalogRow.allergens],
      dietFlags: [...catalogRow.dietFlags],
    };
  }

  /**
   * Apply a Manager+ override on a single field. Merges into the jsonb
   * `overrides` map; emits INGREDIENT_OVERRIDE_CHANGED for future audit
   * subscribers. Reason ≥10 chars (server-side; matches #13 client-side).
   */
  async applyOverride(input: ApplyOverrideInput): Promise<Ingredient> {
    if (!OVERRIDABLE_FIELDS.includes(input.field)) {
      throw new IngredientOverrideUnknownFieldError(input.field);
    }
    if (input.reason.trim().length < MIN_OVERRIDE_REASON_LENGTH) {
      throw new IngredientOverrideReasonError(MIN_OVERRIDE_REASON_LENGTH);
    }

    const updated = await this.dataSource.transaction(async (em) => {
      const repo = em.getRepository(Ingredient);
      const ing = await repo.findOneBy({
        id: input.ingredientId,
        organizationId: input.organizationId,
      });
      if (!ing) throw new IngredientNotFoundError(input.ingredientId);

      const previous = ing.overrides ?? {};
      ing.overrides = {
        ...previous,
        [input.field]: {
          value: input.value,
          reason: input.reason.trim(),
          appliedBy: input.actorUserId,
          appliedAt: new Date().toISOString(),
        },
      };
      ing.updatedBy = input.actorUserId;
      return repo.save(ing);
    });

    const event: IngredientOverrideChangedEvent = {
      ingredientId: input.ingredientId,
      organizationId: input.organizationId,
      field: input.field,
      appliedBy: input.actorUserId,
      reason: input.reason.trim(),
    };
    this.events.emit(INGREDIENT_OVERRIDE_CHANGED, event);
    this.logger.debug(`Override applied: ${input.field} on ${input.ingredientId} by ${input.actorUserId}`);
    return updated;
  }

  /**
   * Walks the Recipe sub-recipe tree, sums leaf-ingredient nutrition × scaled
   * quantity × cumulative (yield × (1 − waste)). Returns per-portion + per-
   * 100g + ODbL attribution list.
   */
  async getMacroRollup(organizationId: string, recipeId: string): Promise<MacroTotals> {
    const perPortion: Record<string, number> = {};
    const externalSources: Array<{ ingredientId: string; externalSourceRef: string }> = [];
    let totalWeightG = 0;
    let weightTrackable = true;

    await walkRecipeTree(
      this.dataSource.manager,
      organizationId,
      recipeId,
      async (ctx) => {
        const ingredientId = ctx.line.ingredientId!;
        const ing = await this.ingredients.findOneBy({ id: ingredientId });
        if (!ing) return;

        if (ing.externalSourceRef) {
          externalSources.push({
            ingredientId: ing.id,
            externalSourceRef: ing.externalSourceRef,
          });
        }

        if (ing.baseUnitType === 'WEIGHT') {
          totalWeightG += ctx.scaledQuantity * ctx.cumulativeYieldWaste;
        } else {
          // Mixed-base recipes don't surface a meaningful per-100g view.
          weightTrackable = false;
        }

        const nutrition = this.effectiveNutrition(ing);
        if (!nutrition) return;

        const portionMultiplier = ctx.scaledQuantity * ctx.cumulativeYieldWaste;
        // Convention from #4 mapper: nutrition values are normalised to
        // per-100g of the ingredient. Scale by (qty / 100) for raw contribution.
        const scale = portionMultiplier / 100;

        for (const [key, raw] of Object.entries(nutrition)) {
          const value = Number(raw);
          if (!Number.isFinite(value)) continue;
          perPortion[key] = (perPortion[key] ?? 0) + value * scale;
        }
      },
    );

    const per100g: Record<string, number> = {};
    if (weightTrackable && totalWeightG > 0) {
      for (const [key, total] of Object.entries(perPortion)) {
        per100g[key] = (total / totalWeightG) * 100;
      }
    }

    return {
      perPortion: this.roundAllValues(perPortion),
      per100g: weightTrackable && totalWeightG > 0 ? this.roundAllValues(per100g) : {},
      totalWeightG: weightTrackable ? this.round4(totalWeightG) : null,
      externalSources,
    };
  }

  /** Effective nutrition map: override > base. */
  private effectiveNutrition(ing: Ingredient): Record<string, unknown> | null {
    const override = ing.overrides?.nutrition;
    if (override) return override.value as Record<string, unknown> | null;
    return ing.nutrition;
  }

  private roundAllValues(map: Record<string, number>): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(map)) {
      out[k] = this.round4(v);
    }
    return out;
  }

  private round4(value: number): number {
    return Math.round(value * 10_000) / 10_000;
  }
}

/** Re-export the recipe-tree error so endpoint translators can map it. */
export { RecipeTreeRecipeNotFoundError };
