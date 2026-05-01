import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Recipe } from '../domain/recipe.entity';

@Injectable()
export class RecipeRepository extends Repository<Recipe> {
  constructor(@InjectDataSource() dataSource: DataSource) {
    super(Recipe, dataSource.createEntityManager());
  }

  async findActiveByOrganization(organizationId: string): Promise<Recipe[]> {
    return this.findBy({ organizationId, isActive: true });
  }
}
