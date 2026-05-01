import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { SupplierItem } from '../domain/supplier-item.entity';

@Injectable()
export class SupplierItemRepository extends Repository<SupplierItem> {
  constructor(@InjectDataSource() dataSource: DataSource) {
    super(SupplierItem, dataSource.createEntityManager());
  }

  async findByIngredient(ingredientId: string): Promise<SupplierItem[]> {
    return this.findBy({ ingredientId });
  }

  async findPreferredForIngredient(ingredientId: string): Promise<SupplierItem | null> {
    return this.findOneBy({ ingredientId, isPreferred: true });
  }

  /**
   * Atomic "promote to preferred" — within a single transaction, demote any
   * currently-preferred SupplierItem for the same ingredient, then promote
   * the target. Honors the partial unique index `(ingredient_id) WHERE
   * is_preferred = true` without race conditions under concurrent writes.
   */
  async promoteToPreferred(supplierItemId: string): Promise<SupplierItem> {
    return this.manager.transaction(async (em) => {
      const target = await em.findOne(SupplierItem, { where: { id: supplierItemId } });
      if (!target) {
        throw new Error(`SupplierItem not found: ${supplierItemId}`);
      }
      // Demote any other preferred row for the same ingredient FIRST so the
      // partial unique index doesn't reject the promotion mid-flight.
      await em.update(
        SupplierItem,
        { ingredientId: target.ingredientId, isPreferred: true },
        { isPreferred: false },
      );
      target.setPreferred(true);
      return em.save(target);
    });
  }
}
