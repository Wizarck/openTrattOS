import { Module } from '@nestjs/common';
import { IngredientsController } from './interface/ingredients.controller';
import { SuppliersController } from './interface/suppliers.controller';
import { CategoriesController } from './interface/categories.controller';

@Module({
  controllers: [
    IngredientsController,
    SuppliersController,
    CategoriesController,
  ],
  providers: [
    // Use cases will be registered here as providers
    // e.g. CreateIngredientUseCase, ConvertUomUseCase, SeedCategoriesUseCase
  ],
  exports: [],
})
export class IngredientsModule {}
