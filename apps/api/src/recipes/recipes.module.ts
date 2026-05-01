import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MenuItem } from '../menus/domain/menu-item.entity';
import { RecipesService } from './application/recipes.service';
import { Recipe } from './domain/recipe.entity';
import { RecipeIngredient } from './domain/recipe-ingredient.entity';
import { RecipeRepository } from './infrastructure/recipe.repository';
import { RecipeIngredientRepository } from './infrastructure/recipe-ingredient.repository';
import { RecipesController } from './interface/recipes.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Recipe, RecipeIngredient, MenuItem])],
  controllers: [RecipesController],
  providers: [RecipeRepository, RecipeIngredientRepository, RecipesService],
  exports: [RecipeRepository, RecipeIngredientRepository, RecipesService, TypeOrmModule],
})
export class RecipesModule {}
