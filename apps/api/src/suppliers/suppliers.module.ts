import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IamModule } from '../iam/iam.module';
import { IngredientsModule } from '../ingredients/ingredients.module';
import { AuditResolverRegistry } from '../shared/application/audit-resolver-registry';
import { Supplier } from './domain/supplier.entity';
import { SupplierItem } from './domain/supplier-item.entity';
import { SupplierItemRepository } from './infrastructure/supplier-item.repository';
import { SupplierRepository } from './infrastructure/supplier.repository';
import { SupplierItemsController } from './interface/supplier-items.controller';
import { SuppliersController } from './interface/suppliers.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Supplier, SupplierItem]), IngredientsModule, IamModule],
  controllers: [SuppliersController, SupplierItemsController],
  providers: [SupplierRepository, SupplierItemRepository],
  exports: [SupplierRepository, SupplierItemRepository, TypeOrmModule],
})
export class SuppliersModule implements OnApplicationBootstrap {
  constructor(
    private readonly suppliers: SupplierRepository,
    private readonly supplierItems: SupplierItemRepository,
    private readonly registry: AuditResolverRegistry,
  ) {}

  onApplicationBootstrap(): void {
    this.registry.register('supplier', async (id) => {
      try {
        return (await this.suppliers.findOneBy({ id })) ?? null;
      } catch {
        return null;
      }
    });
    this.registry.register('supplier_item', async (id) => {
      try {
        return (await this.supplierItems.findOneBy({ id })) ?? null;
      } catch {
        return null;
      }
    });
  }
}
