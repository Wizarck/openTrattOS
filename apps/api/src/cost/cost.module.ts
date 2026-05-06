import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { IamModule } from '../iam/iam.module';
import { IngredientsModule } from '../ingredients/ingredients.module';
import { RecipesModule } from '../recipes/recipes.module';
import { SuppliersModule } from '../suppliers/suppliers.module';
import { CostService } from './application/cost.service';
import { PreferredSupplierResolver } from './application/preferred-supplier.resolver';
import { RecipesCostController } from './interface/recipes-cost.controller';
import { INVENTORY_COST_RESOLVER } from './inventory-cost-resolver';

@Module({
  imports: [
    AuditLogModule,
    IamModule,
    IngredientsModule,
    SuppliersModule,
    RecipesModule,
  ],
  controllers: [RecipesCostController],
  providers: [
    PreferredSupplierResolver,
    { provide: INVENTORY_COST_RESOLVER, useExisting: PreferredSupplierResolver },
    CostService,
  ],
  exports: [INVENTORY_COST_RESOLVER, CostService],
})
export class CostModule {}
