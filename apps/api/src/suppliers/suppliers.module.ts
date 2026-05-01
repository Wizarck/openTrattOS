import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Supplier } from './domain/supplier.entity';
import { SupplierItem } from './domain/supplier-item.entity';
import { SupplierItemRepository } from './infrastructure/supplier-item.repository';
import { SupplierRepository } from './infrastructure/supplier.repository';

@Module({
  imports: [TypeOrmModule.forFeature([Supplier, SupplierItem])],
  providers: [SupplierRepository, SupplierItemRepository],
  exports: [SupplierRepository, SupplierItemRepository, TypeOrmModule],
})
export class SuppliersModule {}
