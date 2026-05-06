import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MenuItem } from '../menus/domain/menu-item.entity';
import { AuditResolverRegistry } from '../shared/application/audit-resolver-registry';
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
export class RecipesModule implements OnApplicationBootstrap {
  constructor(
    private readonly recipes: RecipesService,
    private readonly registry: AuditResolverRegistry,
  ) {}

  onApplicationBootstrap(): void {
    this.registry.register('recipe', async (id, req) => {
      const orgId = (req as { user?: { organizationId?: string } }).user?.organizationId;
      if (!orgId) return null;
      try {
        const result = await this.recipes.findOne(orgId, id);
        return result?.recipe ?? null;
      } catch {
        return null;
      }
    });
  }
}
