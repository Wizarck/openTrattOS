import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IngredientExportService } from './application/ingredient-export.service';
import { IngredientImportService } from './application/ingredient-import.service';
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
  providers: [CategoryRepository, IngredientRepository, IngredientImportService, IngredientExportService],
  exports: [CategoryRepository, IngredientRepository, IngredientImportService, IngredientExportService, TypeOrmModule],
})
export class IngredientsModule {}
