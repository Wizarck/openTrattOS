import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../shared/decorators/roles.decorator';
import {
  CycleDetectedError,
  CycleHit,
} from '../application/cycle-detector';
import { UpdateLineSourceDto } from '../../cost/interface/dto/cost.dto';
import {
  RecipeInUseError,
  RecipeIngredientNotFoundError,
  RecipeNotFoundError,
  RecipesService,
} from '../application/recipes.service';
import { RecipeRepository } from '../infrastructure/recipe.repository';
import {
  CreateRecipeDto,
  RecipeLineResponseDto,
  RecipeResponseDto,
  RecipeStaffViewDto,
  UpdateRecipeDto,
} from './dto/recipe.dto';
import { RecipesAllergensService } from '../application/recipes-allergens.service';

@ApiTags('Recipes')
@Controller('recipes')
export class RecipesController {
  constructor(
    private readonly service: RecipesService,
    private readonly recipes: RecipeRepository,
    private readonly allergens: RecipesAllergensService,
  ) {}

  @Post()
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({
    summary: 'Create a new Recipe with composition lines',
    description:
      'Validates lines + runs cycle detection (depth cap 10 per NFR Scalability) ' +
      'before persisting. Returns 422 with the cycle path on detection.',
  })
  async create(@Body() dto: CreateRecipeDto): Promise<RecipeResponseDto> {
    try {
      const result = await this.service.create({
        organizationId: dto.organizationId,
        name: dto.name,
        description: dto.description,
        notes: dto.notes,
        wasteFactor: dto.wasteFactor,
        lines: dto.lines,
      });
      return RecipeResponseDto.fromEntity(result.recipe, result.lines, result.displayLabel ?? result.recipe.name);
    } catch (err) {
      throw this.translate(err);
    }
  }

  @Get()
  @Roles('OWNER', 'MANAGER', 'STAFF')
  @ApiOperation({ summary: 'List recipes for an organization' })
  async list(
    @Query('organizationId', new ParseUUIDPipe({ version: '4' })) organizationId: string,
    @Query('selectableForSubRecipe') selectableForSubRecipe?: string,
  ): Promise<RecipeResponseDto[]> {
    const flag = selectableForSubRecipe === 'true';
    const recipes = await this.service.findAll(organizationId, { selectableForSubRecipe: flag });
    return recipes.map((r) =>
      RecipeResponseDto.fromEntity(r, [], r.isActive ? r.name : `${r.name} (Discontinued)`),
    );
  }

  @Get(':id')
  @Roles('OWNER', 'MANAGER', 'STAFF')
  @ApiOperation({ summary: 'Get a Recipe with its composition lines' })
  async getById(
    @Query('organizationId', new ParseUUIDPipe({ version: '4' })) organizationId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<RecipeResponseDto> {
    try {
      const result = await this.service.findOne(organizationId, id);
      return RecipeResponseDto.fromEntity(
        result.recipe,
        result.lines,
        result.displayLabel ?? result.recipe.name,
      );
    } catch (err) {
      throw this.translate(err);
    }
  }

  @Get(':id/staff-view')
  @Roles('OWNER', 'MANAGER', 'STAFF')
  @ApiOperation({
    summary: 'Read-only Recipe payload for Staff (no cost / margin / audit)',
    description:
      'Returns ingredient list + allergen rollup + diet flags + finished-portion macros only. Available to all roles; Manager+ may continue to use GET /recipes/:id for the full payload.',
  })
  async getStaffView(
    @Query('organizationId', new ParseUUIDPipe({ version: '4' })) organizationId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<RecipeStaffViewDto> {
    try {
      const result = await this.service.findOne(organizationId, id);
      const allergens = await this.allergens.getAllergensRollup(organizationId, id);
      const dietFlags = await this.allergens.getDietFlagsRollup(organizationId, id);
      return RecipeStaffViewDto.from(result.recipe, result.lines, allergens, dietFlags);
    } catch (err) {
      throw this.translate(err);
    }
  }

  @Put(':id')
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({
    summary: 'Update a Recipe (renames + replaces lines + re-runs cycle detection)',
  })
  async update(
    @Query('organizationId', new ParseUUIDPipe({ version: '4' })) organizationId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateRecipeDto,
  ): Promise<RecipeResponseDto> {
    try {
      const result = await this.service.update(organizationId, id, dto);
      return RecipeResponseDto.fromEntity(
        result.recipe,
        result.lines,
        result.displayLabel ?? result.recipe.name,
      );
    } catch (err) {
      throw this.translate(err);
    }
  }

  @Put(':id/lines/:lineId/source')
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({
    summary: 'Override the cost source for a single RecipeIngredient line',
    description:
      'Persists `sourceOverrideRef` on the line; the resolver will consult it before the preferred SupplierItem on next cost rollup. Pass `sourceOverrideRef: null` to clear.',
  })
  async updateLineSource(
    @Query('organizationId', new ParseUUIDPipe({ version: '4' })) organizationId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('lineId', new ParseUUIDPipe({ version: '4' })) lineId: string,
    @Body() dto: UpdateLineSourceDto,
  ): Promise<RecipeLineResponseDto> {
    try {
      const line = await this.service.updateLineSource(
        organizationId,
        id,
        lineId,
        dto.sourceOverrideRef ?? null,
      );
      return RecipeLineResponseDto.fromEntity(line);
    } catch (err) {
      throw this.translate(err);
    }
  }

  @Delete(':id')
  @Roles('OWNER', 'MANAGER')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Soft-delete a Recipe (sets isActive=false)',
    description:
      'Returns 409 if the Recipe is referenced by an active MenuItem; the controller surfaces ' +
      'the offending MenuItem labels so the chef can deactivate them first.',
  })
  async deactivate(
    @Query('organizationId', new ParseUUIDPipe({ version: '4' })) organizationId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<void> {
    try {
      await this.service.softDelete(organizationId, id);
    } catch (err) {
      throw this.translate(err);
    }
  }

  private translate(err: unknown): Error {
    if (err instanceof RecipeNotFoundError) {
      return new NotFoundException({ code: 'RECIPE_NOT_FOUND', recipeId: err.recipeId });
    }
    if (err instanceof RecipeIngredientNotFoundError) {
      return new NotFoundException({
        code: 'RECIPE_INGREDIENT_NOT_FOUND',
        recipeIngredientId: err.recipeIngredientId,
      });
    }
    if (err instanceof RecipeInUseError) {
      return new ConflictException({
        code: 'RECIPE_IN_USE',
        detail: 'Recipe is referenced by active MenuItems; deactivate them first',
        menuItems: err.menuItemNames,
      });
    }
    if (err instanceof CycleDetectedError) {
      const hit: CycleHit = err.hit;
      return new BadRequestException({
        code: hit.code,
        node1: { id: hit.node1Id, name: hit.node1Name },
        node2: { id: hit.node2Id, name: hit.node2Name },
        direction: hit.direction,
      });
    }
    if (err instanceof Error) return err;
    return new Error(String(err));
  }
}
