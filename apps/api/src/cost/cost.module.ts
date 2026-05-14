import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { IamModule } from '../iam/iam.module';
import { IngredientsModule } from '../ingredients/ingredients.module';
import { InventoryModule } from '../inventory/inventory.module';
import { RecipesModule } from '../recipes/recipes.module';
import { SuppliersModule } from '../suppliers/suppliers.module';
import { CostService } from './application/cost.service';
import { InventoryCostResolverServiceM3 } from './application/inventory-cost-resolver.service';
import { PreferredSupplierResolver } from './application/preferred-supplier.resolver';
import { RecipesCostController } from './interface/recipes-cost.controller';
import { INVENTORY_COST_RESOLVER } from './inventory-cost-resolver';

/**
 * M3 cost-resolver feature flag (ADR-COST-DI-FEATURE-FLAG).
 *
 * Reads `process.env.M3_COST_RESOLVER_ENABLED` at module construction:
 *   - 'true' (or unset)  → bind INVENTORY_COST_RESOLVER to M3 service
 *   - 'false'            → fall back to M2 PreferredSupplierResolver
 *
 * Default is M3-on (true). The fallback path stays available for
 * one release cycle while slices #5 (snapshot persistence) + #7 (GR
 * stamps unit_cost_at_received) land. Once production has run M3
 * cost rollups incident-free for 7 days, this flag + M2 binding are
 * removed in a follow-up PR.
 *
 * Exported as a string-keyed token (not Symbol) so module.spec.ts can
 * exercise the toggle without poking module internals.
 */
export const M3_COST_RESOLVER_ENABLED_ENV = 'M3_COST_RESOLVER_ENABLED';

export function isM3CostResolverEnabled(env: NodeJS.ProcessEnv): boolean {
  const raw = env[M3_COST_RESOLVER_ENABLED_ENV];
  if (raw === undefined) return true; // default-on
  return raw !== 'false';
}

@Module({
  imports: [
    AuditLogModule,
    IamModule,
    IngredientsModule,
    SuppliersModule,
    RecipesModule,
    // m3-inventory-cost-resolver-fifo-fefo (slice #4, Wave 2.2):
    // brings LotRepository into the DI graph so the M3 resolver can
    // fetch lot snapshots from the partial-FIFO index.
    InventoryModule,
  ],
  controllers: [RecipesCostController],
  providers: [
    PreferredSupplierResolver,
    InventoryCostResolverServiceM3,
    {
      provide: INVENTORY_COST_RESOLVER,
      useFactory: (
        m3: InventoryCostResolverServiceM3,
        m2: PreferredSupplierResolver,
      ) => (isM3CostResolverEnabled(process.env) ? m3 : m2),
      inject: [InventoryCostResolverServiceM3, PreferredSupplierResolver],
    },
    CostService,
  ],
  exports: [INVENTORY_COST_RESOLVER, CostService, InventoryCostResolverServiceM3],
})
export class CostModule {}
