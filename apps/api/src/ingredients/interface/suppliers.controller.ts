import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Suppliers')
@Controller('suppliers')
export class SuppliersController {
  @Get()
  @ApiOperation({
    summary: 'List all suppliers',
    description: 'Returns a paginated list of active suppliers for the current organization.',
  })
  async findAll(
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
  ) {
    return { data: [], cursor: null, hasMore: false, total: 0 };
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get supplier by ID',
    description: 'Returns a single supplier with all contact details.',
  })
  async findOne(@Param('id') id: string) {
    return {};
  }

  @Post()
  @ApiOperation({
    summary: 'Create a new supplier',
    description: 'Registers a new supplier for the current organization.',
  })
  async create(@Body() body: any) {
    return {};
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a supplier',
    description: 'Updates supplier contact information.',
  })
  async update(@Param('id') id: string, @Body() body: any) {
    return {};
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Deactivate a supplier (soft delete)',
    description: 'Sets isActive to false. Existing supplier items are preserved for cost history.',
  })
  async remove(@Param('id') id: string) {
    return {};
  }
}
