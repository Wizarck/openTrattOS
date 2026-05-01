import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { INVENTORY_COST_RESOLVER } from '../cost/inventory-cost-resolver';
import { IamModule } from '../iam/iam.module';
import { IngredientsModule } from '../ingredients/ingredients.module';
import { M1InventoryCostResolver } from './application/m1-inventory-cost-resolver';
import { Supplier } from './domain/supplier.entity';
import { SupplierItem } from './domain/supplier-item.entity';
import { SupplierItemRepository } from './infrastructure/supplier-item.repository';
import { SupplierRepository } from './infrastructure/supplier.repository';
import { SupplierItemsController } from './interface/supplier-items.controller';
import { SuppliersController } from './interface/suppliers.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Supplier, SupplierItem]), IngredientsModule, IamModule],
  controllers: [SuppliersController, SupplierItemsController],
  providers: [
    SupplierRepository,
    SupplierItemRepository,
    M1InventoryCostResolver,
    { provide: INVENTORY_COST_RESOLVER, useExisting: M1InventoryCostResolver },
  ],
  exports: [
    SupplierRepository,
    SupplierItemRepository,
    INVENTORY_COST_RESOLVER,
    TypeOrmModule,
  ],
})
export class SuppliersModule {}
