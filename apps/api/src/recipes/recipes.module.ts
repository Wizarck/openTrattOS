import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Recipe } from './domain/recipe.entity';
import { RecipeIngredient } from './domain/recipe-ingredient.entity';
import { RecipeRepository } from './infrastructure/recipe.repository';
import { RecipeIngredientRepository } from './infrastructure/recipe-ingredient.repository';

@Module({
  imports: [TypeOrmModule.forFeature([Recipe, RecipeIngredient])],
  providers: [RecipeRepository, RecipeIngredientRepository],
  exports: [RecipeRepository, RecipeIngredientRepository, TypeOrmModule],
})
export class RecipesModule {}
