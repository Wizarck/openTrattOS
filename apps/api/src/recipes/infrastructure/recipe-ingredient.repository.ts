import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { RecipeIngredient } from '../domain/recipe-ingredient.entity';

@Injectable()
export class RecipeIngredientRepository extends Repository<RecipeIngredient> {
  constructor(@InjectDataSource() dataSource: DataSource) {
    super(RecipeIngredient, dataSource.createEntityManager());
  }

  async findByRecipe(recipeId: string): Promise<RecipeIngredient[]> {
    return this.findBy({ recipeId });
  }
}
