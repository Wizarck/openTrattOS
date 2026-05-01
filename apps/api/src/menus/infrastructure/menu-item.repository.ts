import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { MenuItem } from '../domain/menu-item.entity';

@Injectable()
export class MenuItemRepository extends Repository<MenuItem> {
  constructor(@InjectDataSource() dataSource: DataSource) {
    super(MenuItem, dataSource.createEntityManager());
  }

  async findByRecipe(recipeId: string): Promise<MenuItem[]> {
    return this.findBy({ recipeId });
  }

  async findActiveByOrganizationAndLocation(
    organizationId: string,
    locationId: string,
  ): Promise<MenuItem[]> {
    return this.findBy({ organizationId, locationId, isActive: true });
  }
}
