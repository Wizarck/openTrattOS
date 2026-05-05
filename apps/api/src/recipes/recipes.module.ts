import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MenuItem } from '../menus/domain/menu-item.entity';
import { RecipesAllergensService } from './application/recipes-allergens.service';
import { RecipesService } from './application/recipes.service';
import { Recipe } from './domain/recipe.entity';
import { RecipeIngredient } from './domain/recipe-ingredient.entity';
import { RecipeRepository } from './infrastructure/recipe.repository';
import { RecipeIngredientRepository } from './infrastructure/recipe-ingredient.repository';
import { RecipesAllergensController } from './interface/recipes-allergens.controller';
import { RecipesController } from './interface/recipes.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Recipe, RecipeIngredient, MenuItem])],
  controllers: [RecipesController, RecipesAllergensController],
  providers: [
    RecipeRepository,
    RecipeIngredientRepository,
    RecipesService,
    RecipesAllergensService,
  ],
  exports: [
    RecipeRepository,
    RecipeIngredientRepository,
    RecipesService,
    RecipesAllergensService,
    TypeOrmModule,
  ],
})
export class RecipesModule {}
