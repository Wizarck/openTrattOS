import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExternalCatalogModule } from '../external-catalog/external-catalog.module';
import { RecipesModule } from '../recipes/recipes.module';
import { IngredientExportService } from './application/ingredient-export.service';
import { IngredientImportService } from './application/ingredient-import.service';
import { IngredientsService } from './application/ingredients.service';
import { Category } from './domain/category.entity';
import { Ingredient } from './domain/ingredient.entity';
import { CategoryRepository } from './infrastructure/category.repository';
import { IngredientRepository } from './infrastructure/ingredient.repository';
import { IngredientsController } from './interface/ingredients.controller';
import { CategoriesController } from './interface/categories.controller';
import { RecipesMacrosController } from './interface/recipes-macros.controller';
import { UoMController } from './interface/uom.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Category, Ingredient]), ExternalCatalogModule, RecipesModule],
  controllers: [IngredientsController, CategoriesController, UoMController, RecipesMacrosController],
  providers: [
    CategoryRepository,
    IngredientRepository,
    IngredientImportService,
    IngredientExportService,
    IngredientsService,
  ],
  exports: [
    CategoryRepository,
    IngredientRepository,
    IngredientImportService,
    IngredientExportService,
    IngredientsService,
    TypeOrmModule,
  ],
})
export class IngredientsModule {}
