import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExternalCatalogModule } from '../external-catalog/external-catalog.module';
import { RecipesModule } from '../recipes/recipes.module';
import { AuditResolverRegistry } from '../shared/application/audit-resolver-registry';
import { SharedModule } from '../shared/shared.module';
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
  imports: [SharedModule, TypeOrmModule.forFeature([Category, Ingredient]), ExternalCatalogModule, RecipesModule],
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
export class IngredientsModule implements OnApplicationBootstrap {
  constructor(
    private readonly ingredients: IngredientRepository,
    private readonly categories: CategoryRepository,
    private readonly registry: AuditResolverRegistry,
  ) {}

  onApplicationBootstrap(): void {
    this.registry.register('ingredient', async (id) => {
      try {
        return (await this.ingredients.findOneBy({ id })) ?? null;
      } catch {
        return null;
      }
    });
    this.registry.register('category', async (id) => {
      try {
        return (await this.categories.findOneBy({ id })) ?? null;
      } catch {
        return null;
      }
    });
  }
}
