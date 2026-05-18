import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { QueryFailedError } from 'typeorm';
import { AuditAggregate } from '../../shared/decorators/audit-aggregate.decorator';
import { Roles } from '../../shared/decorators/roles.decorator';
import {
  WriteResponseDto,
  toWriteResponse,
} from '../../shared/dto/write-response.dto';
import {
  CategoriesCommitPayload,
  CategoriesCommitResult,
  CategoriesImportFormatError,
  CategoriesImportService,
  CategoriesPreviewResult,
  CSV_MAX_BYTES,
} from '../application/categories-import.service';
import { Category } from '../domain/category.entity';
import { CategoryRepository } from '../infrastructure/category.repository';
import { CategoryResponseDto, CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

interface UploadedCsvFile {
  fieldname: string;
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

@ApiTags('Categories')
@Controller('categories')
export class CategoriesController {
  constructor(
    private readonly categories: CategoryRepository,
    private readonly importService: CategoriesImportService,
  ) {}

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
  @AuditAggregate('category', null)
  @ApiOperation({ summary: 'Create a new category (custom; isDefault is false)' })
  async create(@Body() dto: CreateCategoryDto): Promise<WriteResponseDto<CategoryResponseDto>> {
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
      return toWriteResponse(CategoryResponseDto.fromEntity(saved));
    } catch (err) {
      if (err instanceof QueryFailedError && /uq_categories_org_parent_name/.test(err.message)) {
        throw new ConflictException({ code: 'CATEGORY_DUPLICATE_NAME_AT_PARENT' });
      }
      throw err;
    }
  }

  @Patch(':id')
  @Roles('OWNER', 'MANAGER')
  @AuditAggregate('category')
  @ApiOperation({ summary: 'Update a category — rename or reparent' })
  async update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<WriteResponseDto<CategoryResponseDto>> {
    const cat = await this.categories.findOneBy({ id });
    if (!cat) throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND' });
    cat.applyUpdate(dto);
    const saved = await this.categories.save(cat);
    return toWriteResponse(CategoryResponseDto.fromEntity(saved));
  }

  @Delete(':id')
  @Roles('OWNER', 'MANAGER')
  @AuditAggregate('category')
  @ApiOperation({
    summary: 'Delete a category',
    description: 'Blocked (RESTRICT) if it has child categories or linked ingredients.',
  })
  async remove(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<WriteResponseDto<{ id: string }>> {
    const cat = await this.categories.findOneBy({ id });
    if (!cat) throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND' });
    try {
      await this.categories.delete({ id });
      return toWriteResponse({ id });
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

  @Post('import/preview')
  @Roles('OWNER')
  @UseInterceptors(FileInterceptor('csv', { limits: { fileSize: CSV_MAX_BYTES } }))
  @ApiOperation({
    summary: 'Preview a categories CSV import (no mutation)',
    description:
      'Parses + validates + dedupes the uploaded CSV against the org\'s existing categories. ' +
      'Returns { totalRows, new, duplicates, errors } so the operator can review before commit. ' +
      'CSV columns: nombre (required, 2-64 chars), padre (optional), color (optional #RRGGBB). ' +
      'Hard limits: 1 MB file size, 5000 rows.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        csv: { type: 'string', format: 'binary' },
      },
    },
  })
  async importPreview(
    @Query('organizationId', new ParseUUIDPipe({ version: '4' })) organizationId: string,
    @UploadedFile() file: UploadedCsvFile | undefined,
  ): Promise<WriteResponseDto<CategoriesPreviewResult>> {
    if (!file) {
      throw new BadRequestException({
        code: 'CATEGORIES_CSV_IMPORT_INVALID_FORMAT',
        detail: 'no file uploaded (multipart field name must be "csv")',
      });
    }
    try {
      const csvContent = file.buffer.toString('utf8');
      const result = await this.importService.preview(organizationId, csvContent);
      return toWriteResponse(result);
    } catch (err) {
      if (err instanceof CategoriesImportFormatError) {
        throw new BadRequestException({
          code: 'CATEGORIES_CSV_IMPORT_INVALID_FORMAT',
          detail: err.detail,
        });
      }
      throw err;
    }
  }

  @Post('import/commit')
  @Roles('OWNER')
  @AuditAggregate('category', null)
  @ApiOperation({
    summary: 'Commit a previewed categories CSV import',
    description:
      'Applies the previewed plan in a single transaction. Caller selects how to treat ' +
      'duplicates via `mode`: "skip-duplicates" leaves them untouched; "update-duplicates" ' +
      'reparents them when the row supplies a `parentName` that resolves to a different parent. ' +
      'Returns { created, updated, skipped }.',
  })
  async importCommit(
    @Query('organizationId', new ParseUUIDPipe({ version: '4' })) organizationId: string,
    @Body() payload: CategoriesCommitPayload,
  ): Promise<WriteResponseDto<CategoriesCommitResult>> {
    try {
      const result = await this.importService.commit(organizationId, payload);
      return toWriteResponse(result);
    } catch (err) {
      if (err instanceof CategoriesImportFormatError) {
        throw new BadRequestException({
          code: 'CATEGORIES_CSV_IMPORT_INVALID_FORMAT',
          detail: err.detail,
        });
      }
      if (err instanceof QueryFailedError && /uq_categories_org_parent_name/.test(err.message)) {
        throw new ConflictException({ code: 'CATEGORY_DUPLICATE_NAME_AT_PARENT' });
      }
      throw err;
    }
  }
}
