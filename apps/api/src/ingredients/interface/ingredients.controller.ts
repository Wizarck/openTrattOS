import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  NotFoundException,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Readable } from 'node:stream';
import { QueryFailedError } from 'typeorm';
import { Roles } from '../../shared/decorators/roles.decorator';
import { CursorPaginationQueryDto, DEFAULT_PAGE_LIMIT } from '../../shared/pagination';
import { CsvImportFormatError, IngredientImportService, ImportResult } from '../application/ingredient-import.service';
import { IngredientExportService } from '../application/ingredient-export.service';
import { Ingredient } from '../domain/ingredient.entity';
import { IngredientRepository } from '../infrastructure/ingredient.repository';

interface UploadedCsvFile {
  fieldname: string;
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}
import { CreateIngredientDto, IngredientResponseDto, UpdateIngredientDto } from './dto/ingredient.dto';

@ApiTags('Ingredients')
@Controller('ingredients')
export class IngredientsController {
  constructor(
    private readonly ingredients: IngredientRepository,
    private readonly importService: IngredientImportService,
    private readonly exportService: IngredientExportService,
  ) {}

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

  @Post('import')
  @Roles('OWNER', 'MANAGER')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  @ApiOperation({
    summary: 'Bulk-import ingredients from a CSV file',
    description:
      'Streams + validates the CSV in 500-row chunks. With dryRun=true the server returns a preview ' +
      '({ valid, invalid, errors }) without writing any rows. With dryRun=false valid rows commit in ' +
      'transaction-per-chunk semantics: a poisoned chunk rolls back atomically; prior chunks survive.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  async import(
    @Query('organizationId', new ParseUUIDPipe({ version: '4' })) organizationId: string,
    @Query('dryRun', new ParseBoolPipe({ optional: true })) dryRun: boolean | undefined,
    @UploadedFile() file: UploadedCsvFile | undefined,
  ): Promise<ImportResult> {
    if (!file) {
      throw new BadRequestException({ code: 'CSV_IMPORT_INVALID_FORMAT', detail: 'no file uploaded' });
    }
    try {
      const stream = Readable.from(file.buffer);
      return await this.importService.parseAndCommit(stream, {
        organizationId,
        dryRun: dryRun ?? false,
      });
    } catch (err) {
      if (err instanceof CsvImportFormatError) {
        throw new BadRequestException({ code: 'CSV_IMPORT_INVALID_FORMAT', detail: err.detail });
      }
      throw err;
    }
  }

  @Get('export.csv')
  @Roles('OWNER', 'MANAGER')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({
    summary: 'Bulk-export ingredients as CSV',
    description: 'Streams the full ingredient list (cursor-paginated internally so heap stays bounded). Round-trip safe with /ingredients/import.',
  })
  async export(
    @Query('organizationId', new ParseUUIDPipe({ version: '4' })) organizationId: string,
    @Query('includeInactive', new ParseBoolPipe({ optional: true })) includeInactive: boolean | undefined,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Disposition', `attachment; filename="ingredients-${organizationId}-${today}.csv"`);
    await this.exportService.exportToStream(res, {
      organizationId,
      includeInactive: includeInactive ?? false,
    });
  }
}
