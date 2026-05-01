import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, MoreThan, Repository } from 'typeorm';
import { Ingredient } from '../domain/ingredient.entity';

export interface IngredientPage {
  items: Ingredient[];
  nextCursor: string | null;
}

@Injectable()
export class IngredientRepository extends Repository<Ingredient> {
  constructor(@InjectDataSource() dataSource: DataSource) {
    super(Ingredient, dataSource.createEntityManager());
  }

  async findActiveByOrganization(organizationId: string): Promise<Ingredient[]> {
    return this.findBy({ organizationId, isActive: true });
  }

  async findByInternalCode(organizationId: string, internalCode: string): Promise<Ingredient | null> {
    return this.findOneBy({ organizationId, internalCode });
  }

  /**
   * Cursor-based pagination over (id ASC). Determinist; safe for soft-deletes
   * (caller filters `isActive` if it wants only active rows).
   */
  async pageByOrganization(
    organizationId: string,
    cursor: string | null,
    limit: number,
    onlyActive: boolean,
  ): Promise<IngredientPage> {
    const where: Record<string, unknown> = { organizationId };
    if (cursor) {
      where['id'] = MoreThan(cursor);
    }
    if (onlyActive) {
      where['isActive'] = true;
    }
    const items = await this.find({
      where,
      order: { id: 'ASC' },
      take: Math.min(limit, 100) + 1,
    });
    const hasMore = items.length > Math.min(limit, 100);
    const trimmed = hasMore ? items.slice(0, Math.min(limit, 100)) : items;
    return {
      items: trimmed,
      nextCursor: hasMore ? trimmed[trimmed.length - 1].id : null,
    };
  }
}
