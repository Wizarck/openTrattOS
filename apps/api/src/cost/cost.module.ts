import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IamModule } from '../iam/iam.module';
import { IngredientsModule } from '../ingredients/ingredients.module';
import { RecipesModule } from '../recipes/recipes.module';
import { SuppliersModule } from '../suppliers/suppliers.module';
import { CostService } from './application/cost.service';
import { PreferredSupplierResolver } from './application/preferred-supplier.resolver';
import { RecipeCostHistory } from './domain/recipe-cost-history.entity';
import { RecipeCostHistoryRepository } from './infrastructure/recipe-cost-history.repository';
import { RecipesCostController } from './interface/recipes-cost.controller';
import { INVENTORY_COST_RESOLVER } from './inventory-cost-resolver';

@Module({
  imports: [
    TypeOrmModule.forFeature([RecipeCostHistory]),
    IamModule,
    IngredientsModule,
    SuppliersModule,
    RecipesModule,
  ],
  controllers: [RecipesCostController],
  providers: [
    PreferredSupplierResolver,
    { provide: INVENTORY_COST_RESOLVER, useExisting: PreferredSupplierResolver },
    RecipeCostHistoryRepository,
    CostService,
  ],
  exports: [
    INVENTORY_COST_RESOLVER,
    CostService,
    RecipeCostHistoryRepository,
    TypeOrmModule,
  ],
})
export class CostModule {}
