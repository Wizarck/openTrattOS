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
import { Category } from '../domain/category.entity';
import { CategoryRepository } from '../infrastructure/category.repository';
import { CategoryResponseDto, CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

@ApiTags('Categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoryRepository) {}

  @Get('tree')
  @Roles('OWNER', 'MANAGER', 'STAFF')
  @ApiOperation({
    summary: 'Get the full category tree for an organization (depth-ordered)',
    description: 'Single recursive CTE; no N+1. Items returned with parent before children (BFS order).',
  })
  async getTree(
    @Query('organizationId', new ParseUUIDPipe({ version: '4' })) organizationId: string,
  ): Promise<CategoryResponseDto[]> {
    const rows = await this.categories.findTreeByOrganization(organizationId);
    return rows.map(CategoryResponseDto.fromEntity);
  }

  @Get('roots')
  @Roles('OWNER', 'MANAGER', 'STAFF')
  @ApiOperation({ summary: 'List root categories for an organization (parentId IS NULL)' })
  async getRoots(
    @Query('organizationId', new ParseUUIDPipe({ version: '4' })) organizationId: string,
  ): Promise<CategoryResponseDto[]> {
    const rows = await this.categories.findRootsByOrganization(organizationId);
    return rows.map(CategoryResponseDto.fromEntity);
  }

  @Post()
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({ summary: 'Create a new category (custom; isDefault is false)' })
  async create(@Body() dto: CreateCategoryDto): Promise<CategoryResponseDto> {
    const cat = Category.create({
      organizationId: dto.organizationId,
      parentId: dto.parentId ?? null,
      name: dto.name,
      nameEs: dto.nameEs,
      nameEn: dto.nameEn,
      sortOrder: dto.sortOrder,
    });
    try {
      const saved = await this.categories.save(cat);
      return CategoryResponseDto.fromEntity(saved);
    } catch (err) {
      if (err instanceof QueryFailedError && /uq_categories_org_parent_name/.test(err.message)) {
        throw new ConflictException({ code: 'CATEGORY_DUPLICATE_NAME_AT_PARENT' });
      }
      throw err;
    }
  }

  @Patch(':id')
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({ summary: 'Update a category — rename or reparent' })
  async update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<CategoryResponseDto> {
    const cat = await this.categories.findOneBy({ id });
    if (!cat) throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND' });
    cat.applyUpdate(dto);
    const saved = await this.categories.save(cat);
    return CategoryResponseDto.fromEntity(saved);
  }

  @Delete(':id')
  @Roles('OWNER', 'MANAGER')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Delete a category',
    description: 'Blocked (RESTRICT) if it has child categories or linked ingredients.',
  })
  async remove(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string): Promise<void> {
    const cat = await this.categories.findOneBy({ id });
    if (!cat) throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND' });
    try {
      await this.categories.delete({ id });
    } catch (err) {
      if (err instanceof QueryFailedError) {
        const msg = err.message;
        if (/fk_categories_parent/.test(msg)) {
          throw new ConflictException({ code: 'CATEGORY_HAS_CHILDREN' });
        }
        if (/fk_ingredients_category/.test(msg)) {
          throw new ConflictException({ code: 'CATEGORY_HAS_INGREDIENTS' });
        }
      }
      throw err;
    }
  }
}
