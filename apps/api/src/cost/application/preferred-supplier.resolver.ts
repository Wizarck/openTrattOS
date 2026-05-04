import { Injectable } from '@nestjs/common';
import { IngredientRepository } from '../../ingredients/infrastructure/ingredient.repository';
import { OrganizationRepository } from '../../iam/infrastructure/organization.repository';
import { SupplierItemRepository } from '../../suppliers/infrastructure/supplier-item.repository';
import { SupplierRepository } from '../../suppliers/infrastructure/supplier.repository';
import { Ingredient } from '../../ingredients/domain/ingredient.entity';
import { SupplierItem } from '../../suppliers/domain/supplier-item.entity';
import {
  CostSource,
  InventoryCostResolver,
  NoCostSourceError,
  ResolveOptions,
  ResolvedCost,
  normaliseResolveOptions,
} from '../inventory-cost-resolver';

/**
 * M2 binding for `InventoryCostResolver`. Resolves cost via:
 *   1. `options.sourceOverrideRef` — when set, looks up that SupplierItem by id
 *      and uses it iff it is still tied to the same ingredient. Otherwise falls
 *      back to the preferred row (a stale override never leaves the chef without
 *      a price).
 *   2. The preferred SupplierItem (`isPreferred=true`) for the ingredient.
 *
 * Throws `NoCostSourceError` when:
 *   - the ingredient does not exist
 *   - the organization does not exist (used for currency lookup)
 *   - neither the override nor a preferred SupplierItem yields a usable row
 *
 * `asOf` is accepted but ignored — M2 has no temporal cost history at the
 * resolver layer (history is stored at recipe-cost level by `CostService`).
 * M3 will replace this binding with a batch-aware resolver where `asOf` matters.
 */
@Injectable()
export class PreferredSupplierResolver implements InventoryCostResolver {
  constructor(
    private readonly ingredients: IngredientRepository,
    private readonly supplierItems: SupplierItemRepository,
    private readonly suppliers: SupplierRepository,
    private readonly organizations: OrganizationRepository,
  ) {}

  async resolveBaseCost(
    ingredientId: string,
    options?: ResolveOptions | Date,
  ): Promise<ResolvedCost> {
    const opts = normaliseResolveOptions(options);

    const ingredient = await this.ingredients.findOneBy({ id: ingredientId });
    if (!ingredient) {
      throw new NoCostSourceError(ingredientId, 'ingredient not found');
    }

    let item: SupplierItem | null = null;
    if (opts.sourceOverrideRef) {
      const candidate = await this.supplierItems.findOneBy({ id: opts.sourceOverrideRef });
      if (candidate && candidate.ingredientId === ingredient.id) {
        item = candidate;
      }
    }
    if (!item) {
      item = await this.supplierItems.findPreferredForIngredient(ingredient.id);
    }
    if (!item) {
      throw new NoCostSourceError(
        ingredient.id,
        'no preferred SupplierItem; create or promote one before resolving cost',
      );
    }

    return this.toResolvedCost(item, ingredient);
  }

  private async toResolvedCost(item: SupplierItem, ingredient: Ingredient): Promise<ResolvedCost> {
    let costPerBaseUnit = item.costPerBaseUnit;
    if (costPerBaseUnit === null || costPerBaseUnit === undefined) {
      costPerBaseUnit = item.computeCostPerBaseUnit(ingredient);
    }

    const org = await this.organizations.findOneBy({ id: ingredient.organizationId });
    if (!org) {
      throw new NoCostSourceError(
        ingredient.id,
        `organization ${ingredient.organizationId} not found (orphan ingredient)`,
      );
    }

    const supplier = await this.suppliers.findOneBy({ id: item.supplierId });
    const displayLabel = supplier
      ? `${supplier.name} — ${item.purchaseUnit}`
      : item.purchaseUnit;

    const source: CostSource = {
      kind: 'supplier-item',
      refId: item.id,
      displayLabel,
    };

    return {
      costPerBaseUnit: Number(costPerBaseUnit),
      currency: org.currencyCode,
      source,
    };
  }
}
