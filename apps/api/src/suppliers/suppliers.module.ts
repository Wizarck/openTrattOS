import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IngredientsModule } from '../ingredients/ingredients.module';
import { Supplier } from './domain/supplier.entity';
import { SupplierItem } from './domain/supplier-item.entity';
import { SupplierItemRepository } from './infrastructure/supplier-item.repository';
import { SupplierRepository } from './infrastructure/supplier.repository';
import { SupplierItemsController } from './interface/supplier-items.controller';
import { SuppliersController } from './interface/suppliers.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Supplier, SupplierItem]), IngredientsModule],
  controllers: [SuppliersController, SupplierItemsController],
  providers: [SupplierRepository, SupplierItemRepository],
  exports: [SupplierRepository, SupplierItemRepository, TypeOrmModule],
})
export class SuppliersModule {}
