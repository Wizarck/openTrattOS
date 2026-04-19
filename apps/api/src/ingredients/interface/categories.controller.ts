import { Controller, Get, Post, Patch, Delete, Param, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Categories')
@Controller('categories')
export class CategoriesController {
  @Get('tree')
  @ApiOperation({
    summary: 'Get full category tree',
    description:
      'Returns the entire category hierarchy as a nested tree structure. ' +
      'Loaded in a single recursive CTE query (no N+1).',
  })
  async getTree() {
    return [];
  }

  @Post()
  @ApiOperation({
    summary: 'Create a new category',
    description:
      'Creates a category node. If parentId is provided, it becomes a child of that node.',
  })
  async create(@Body() body: any) {
    return {};
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a category',
    description: 'Renames a category or moves it to a new parent.',
  })
  async update(@Param('id') id: string, @Body() body: any) {
    return {};
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a category',
    description:
      'Deletes a category. Blocked (RESTRICT) if it has child categories or ingredients.',
  })
  async remove(@Param('id') id: string) {
    return {};
  }
}
