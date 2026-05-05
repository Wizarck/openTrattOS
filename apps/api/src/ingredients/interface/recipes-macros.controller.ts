import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../shared/decorators/roles.decorator';
import { RecipeTreeRecipeNotFoundError } from '../../recipes/application/recipe-tree-walker';
import { IngredientsService } from '../application/ingredients.service';
import { MacroRollupDto } from './dto/ingredient.dto';

/**
 * Recipe-level macro rollup endpoint. Lives in the Ingredients module because
 * the rollup is a function over the Ingredient `nutrition` jsonb (the
 * IngredientsService owns the walker call). Routes under `/recipes` to match
 * the user-facing URL space.
 */
@ApiTags('Recipes — Macros')
@Controller('recipes')
export class RecipesMacrosController {
  constructor(private readonly service: IngredientsService) {}

  @Get(':id/macros')
  @Roles('OWNER', 'MANAGER', 'STAFF')
  @ApiOperation({
    summary: 'Macro rollup for a Recipe (FR24)',
    description:
      'Walks the recipe sub-recipe tree, sums leaf-ingredient nutrition × scaled qty × cumulative (yield × (1 − waste)). Returns per-portion + per-100g + ODbL attribution list.',
  })
  async getMacros(
    @Query('organizationId', new ParseUUIDPipe({ version: '4' })) organizationId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<MacroRollupDto> {
    try {
      const rollup = await this.service.getMacroRollup(organizationId, id);
      return rollup;
    } catch (err) {
      if (err instanceof RecipeTreeRecipeNotFoundError) {
        throw new NotFoundException({ code: 'RECIPE_NOT_FOUND', recipeId: err.recipeId });
      }
      throw err;
    }
  }
}
