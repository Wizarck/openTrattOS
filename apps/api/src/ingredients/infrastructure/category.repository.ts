import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { Category } from '../domain/category.entity';

@Injectable()
export class CategoryRepository extends Repository<Category> {
  constructor(@InjectDataSource() dataSource: DataSource) {
    super(Category, dataSource.createEntityManager());
  }

  async findRootsByOrganization(organizationId: string): Promise<Category[]> {
    return this.find({
      where: { organizationId, parentId: IsNull() },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  async findChildren(organizationId: string, parentId: string): Promise<Category[]> {
    return this.find({
      where: { organizationId, parentId },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  /**
   * Returns the full category tree for an org as a flat list ordered by depth
   * (parents before children). Single recursive CTE — no N+1.
   */
  async findTreeByOrganization(organizationId: string): Promise<Category[]> {
    return this.query(
      `
      WITH RECURSIVE tree AS (
        SELECT c.*, 0 AS depth
        FROM categories c
        WHERE c.organization_id = $1 AND c.parent_id IS NULL
        UNION ALL
        SELECT c.*, t.depth + 1 AS depth
        FROM categories c
        JOIN tree t ON c.parent_id = t.id
        WHERE c.organization_id = $1
      )
      SELECT * FROM tree
      ORDER BY depth ASC, sort_order ASC, name ASC
      `,
      [organizationId],
    );
  }
}
