import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Ingredients')
@Controller('ingredients')
export class IngredientsController {
  @Get()
  @ApiOperation({
    summary: 'List all ingredients',
    description:
      'Returns a paginated list of active ingredients for the current organization. ' +
      'Supports filtering by categoryId and search by name.',
  })
  async findAll(
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
    @Query('categoryId') categoryId?: string,
    @Query('search') search?: string,
  ) {
    // TODO: Inject and call ListIngredientsUseCase
    return { data: [], cursor: null, hasMore: false, total: 0 };
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get ingredient by ID',
    description:
      'Returns a single ingredient with its category and preferred supplier item.',
  })
  async findOne(@Param('id') id: string) {
    // TODO: Inject and call GetIngredientUseCase
    return {};
  }

  @Post()
  @ApiOperation({
    summary: 'Create a new ingredient',
    description:
      'Creates an ingredient with a name, category, and base unit type. ' +
      'The baseUnitType is immutable after creation.',
  })
  async create(@Body() body: any) {
    // TODO: Replace `any` with CreateIngredientDto + inject use case
    return {};
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update an ingredient',
    description:
      'Updates mutable fields of an ingredient. Cannot change baseUnitType.',
  })
  async update(@Param('id') id: string, @Body() body: any) {
    // TODO: Replace `any` with UpdateIngredientDto + inject use case
    return {};
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Deactivate an ingredient (soft delete)',
    description:
      'Sets isActive to false. The ingredient remains in the database for ' +
      'historical recipe references but is hidden from default list views.',
  })
  async remove(@Param('id') id: string) {
    // TODO: Inject and call DeactivateIngredientUseCase
    return {};
  }
}
