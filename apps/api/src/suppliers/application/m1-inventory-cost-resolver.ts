import { Injectable } from '@nestjs/common';
import { IngredientRepository } from '../../ingredients/infrastructure/ingredient.repository';
import { OrganizationRepository } from '../../iam/infrastructure/organization.repository';
import {
  CostSource,
  InventoryCostResolver,
  NoCostSourceError,
  ResolvedCost,
} from '../../cost/inventory-cost-resolver';
import { SupplierItemRepository } from '../infrastructure/supplier-item.repository';
import { SupplierRepository } from '../infrastructure/supplier.repository';

/**
 * M1 binding for `InventoryCostResolver`. Resolves cost via the preferred
 * SupplierItem for the ingredient. Throws `NoCostSourceError` when:
 *   - the ingredient does not exist
 *   - the organization does not exist (used for currency lookup)
 *   - no preferred SupplierItem exists for the ingredient
 *
 * `asOf` is accepted but ignored — M1 has no temporal cost history. M3 will
 * replace this binding with a batch-aware resolver where `asOf` matters.
 */
@Injectable()
export class M1InventoryCostResolver implements InventoryCostResolver {
  constructor(
    private readonly ingredients: IngredientRepository,
    private readonly supplierItems: SupplierItemRepository,
    private readonly suppliers: SupplierRepository,
    private readonly organizations: OrganizationRepository,
  ) {}

  async resolveBaseCost(ingredientId: string, _asOf?: Date): Promise<ResolvedCost> {
    const ingredient = await this.ingredients.findOneBy({ id: ingredientId });
    if (!ingredient) {
      throw new NoCostSourceError(ingredientId, 'ingredient not found');
    }

    const preferred = await this.supplierItems.findPreferredForIngredient(ingredient.id);
    if (!preferred) {
      throw new NoCostSourceError(
        ingredient.id,
        'no preferred SupplierItem; create or promote one before resolving cost',
      );
    }

    let costPerBaseUnit = preferred.costPerBaseUnit;
    if (costPerBaseUnit === null || costPerBaseUnit === undefined) {
      // Compute on the fly if a stale row predates the auto-compute path.
      costPerBaseUnit = preferred.computeCostPerBaseUnit(ingredient);
    }

    const org = await this.organizations.findOneBy({ id: ingredient.organizationId });
    if (!org) {
      throw new NoCostSourceError(
        ingredient.id,
        `organization ${ingredient.organizationId} not found (orphan ingredient)`,
      );
    }

    const supplier = await this.suppliers.findOneBy({ id: preferred.supplierId });
    const displayLabel = supplier
      ? `${supplier.name} — ${preferred.purchaseUnit}`
      : preferred.purchaseUnit;

    const source: CostSource = {
      kind: 'supplier-item',
      refId: preferred.id,
      displayLabel,
    };

    return {
      costPerBaseUnit: Number(costPerBaseUnit),
      currency: org.currencyCode,
      source,
    };
  }
}
