import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { QueryFailedError } from 'typeorm';
import { Roles } from '../../shared/decorators/roles.decorator';
import { CursorPaginationQueryDto, DEFAULT_PAGE_LIMIT } from '../../shared/pagination';
import { Ingredient } from '../domain/ingredient.entity';
import { IngredientRepository } from '../infrastructure/ingredient.repository';
import { CreateIngredientDto, IngredientResponseDto, UpdateIngredientDto } from './dto/ingredient.dto';

@ApiTags('Ingredients')
@Controller('ingredients')
export class IngredientsController {
  constructor(private readonly ingredients: IngredientRepository) {}

  @Get()
  @Roles('OWNER', 'MANAGER', 'STAFF')
  @ApiOperation({ summary: 'List ingredients (cursor-paginated; defaults to active only)' })
  async list(
    @Query('organizationId', new ParseUUIDPipe({ version: '4' })) organizationId: string,
    @Query() page: CursorPaginationQueryDto,
    @Query('includeInactive') includeInactive?: string,
  ): Promise<{ items: IngredientResponseDto[]; nextCursor: string | null }> {
    const onlyActive = includeInactive !== 'true';
    const result = await this.ingredients.pageByOrganization(
      organizationId,
      page.cursor ?? null,
      page.limit ?? DEFAULT_PAGE_LIMIT,
      onlyActive,
    );
    return {
      items: result.items.map(IngredientResponseDto.fromEntity),
      nextCursor: result.nextCursor,
    };
  }

  @Get(':id')
  @Roles('OWNER', 'MANAGER', 'STAFF')
  @ApiOperation({ summary: 'Get an ingredient by id' })
  async getById(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string): Promise<IngredientResponseDto> {
    const i = await this.ingredients.findOneBy({ id });
    if (!i) throw new NotFoundException({ code: 'INGREDIENT_NOT_FOUND' });
    return IngredientResponseDto.fromEntity(i);
  }

  @Post()
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({
    summary: 'Create a new ingredient',
    description: 'baseUnitType is immutable post-creation. internalCode auto-generated if not provided.',
  })
  async create(@Body() dto: CreateIngredientDto): Promise<IngredientResponseDto> {
    const ing = Ingredient.create({
      organizationId: dto.organizationId,
      categoryId: dto.categoryId,
      name: dto.name,
      baseUnitType: dto.baseUnitType,
      internalCode: dto.internalCode,
      densityFactor: dto.densityFactor ?? null,
      notes: dto.notes ?? null,
    });
    try {
      const saved = await this.ingredients.save(ing);
      return IngredientResponseDto.fromEntity(saved);
    } catch (err) {
      if (err instanceof QueryFailedError && /uq_ingredients_org_internal_code/.test(err.message)) {
        throw new ConflictException({ code: 'INGREDIENT_DUPLICATE_INTERNAL_CODE' });
      }
      throw err;
    }
  }

  @Patch(':id')
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({ summary: 'Update an ingredient (mutable fields only)' })
  async update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateIngredientDto,
  ): Promise<IngredientResponseDto> {
    const i = await this.ingredients.findOneBy({ id });
    if (!i) throw new NotFoundException({ code: 'INGREDIENT_NOT_FOUND' });
    i.applyUpdate(dto);
    const saved = await this.ingredients.save(i);
    return IngredientResponseDto.fromEntity(saved);
  }

  @Delete(':id')
  @Roles('OWNER', 'MANAGER')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Soft-delete an ingredient (sets isActive=false)',
    description: 'Idempotent. Recipes referring to this ingredient continue to read it (read-side soft-delete).',
  })
  async deactivate(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string): Promise<void> {
    const i = await this.ingredients.findOneBy({ id });
    if (!i) throw new NotFoundException({ code: 'INGREDIENT_NOT_FOUND' });
    i.deactivate();
    await this.ingredients.save(i);
  }

  @Post(':id/reactivate')
  @Roles('OWNER', 'MANAGER')
  @HttpCode(204)
  @ApiOperation({ summary: 'Reactivate a previously soft-deleted ingredient' })
  async reactivate(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string): Promise<void> {
    const i = await this.ingredients.findOneBy({ id });
    if (!i) throw new NotFoundException({ code: 'INGREDIENT_NOT_FOUND' });
    i.reactivate();
    await this.ingredients.save(i);
  }
}
