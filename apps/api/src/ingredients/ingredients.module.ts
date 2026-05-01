import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category } from './domain/category.entity';
import { Ingredient } from './domain/ingredient.entity';
import { CategoryRepository } from './infrastructure/category.repository';
import { IngredientRepository } from './infrastructure/ingredient.repository';
import { IngredientsController } from './interface/ingredients.controller';
import { CategoriesController } from './interface/categories.controller';
import { UoMController } from './interface/uom.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Category, Ingredient])],
  controllers: [IngredientsController, CategoriesController, UoMController],
  providers: [CategoryRepository, IngredientRepository],
  exports: [CategoryRepository, IngredientRepository, TypeOrmModule],
})
export class IngredientsModule {}
