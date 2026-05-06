import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Header,
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
import { AuditAggregate } from '../../shared/decorators/audit-aggregate.decorator';
import { Roles } from '../../shared/decorators/roles.decorator';
import {
  WriteResponseDto,
  toWriteResponse,
} from '../../shared/dto/write-response.dto';
import { CursorPaginationQueryDto, DEFAULT_PAGE_LIMIT } from '../../shared/pagination';
import { CsvImportFormatError, IngredientImportService, ImportResult } from '../application/ingredient-import.service';
import { IngredientExportService } from '../application/ingredient-export.service';
import {
  IngredientNotFoundError,
  IngredientOverrideReasonError,
  IngredientOverrideUnknownFieldError,
  IngredientsService,
} from '../application/ingredients.service';
import { Ingredient } from '../domain/ingredient.entity';
import { IngredientRepository } from '../infrastructure/ingredient.repository';

interface UploadedCsvFile {
  fieldname: string;
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}
import {
  ApplyIngredientOverrideDto,
  CreateIngredientDto,
  IngredientResponseDto,
  IngredientSearchResultDto,
  UpdateIngredientDto,
} from './dto/ingredient.dto';

@ApiTags('Ingredients')
@Controller('ingredients')
export class IngredientsController {
  constructor(
    private readonly ingredients: IngredientRepository,
    private readonly importService: IngredientImportService,
    private readonly exportService: IngredientExportService,
    private readonly service: IngredientsService,
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

  @Get('search')
  @Roles('OWNER', 'MANAGER', 'STAFF')
  @ApiOperation({
    summary: 'Search the OFF mirror by barcode (J1 prefill flow)',
    description:
      'Cache-first lookup against the local ExternalFoodCatalog mirror; falls through to the OFF REST API on miss; returns null on outage (per #4 graceful-degrade).',
  })
  async search(
    @Query('barcode') barcode: string,
    @Query('region') region?: string,
  ): Promise<IngredientSearchResultDto | null> {
    if (!barcode || barcode.trim().length === 0) {
      throw new BadRequestException({ code: 'INGREDIENT_SEARCH_MISSING_BARCODE' });
    }
    const row = await this.service.searchByBarcode(barcode.trim(), region ?? 'eu');
    if (!row) return null;
    return {
      source: 'off',
      barcode: row.barcode,
      brandName: row.brand,
      name: row.name,
      nutrition: row.nutrition,
      allergens: [...row.allergens],
      dietFlags: [...row.dietFlags],
      licenseAttribution: row.licenseAttribution,
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

  @Post(':id/overrides')
  @Roles('OWNER', 'MANAGER')
  @AuditAggregate('ingredient')
  @ApiOperation({
    summary: 'Apply a Manager+ override on a single Ingredient field',
    description:
      'Merges into the jsonb `overrides` map. Reason ≥10 chars (matches #13 client-side). Emits INGREDIENT_OVERRIDE_CHANGED event.',
  })
  async applyOverride(
    @Query('organizationId', new ParseUUIDPipe({ version: '4' })) organizationId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: ApplyIngredientOverrideDto,
  ): Promise<WriteResponseDto<IngredientResponseDto>> {
    try {
      const updated = await this.service.applyOverride({
        organizationId,
        actorUserId: dto.actorUserId,
        ingredientId: id,
        field: dto.field,
        value: dto.value,
        reason: dto.reason,
      });
      return toWriteResponse(IngredientResponseDto.fromEntity(updated));
    } catch (err) {
      if (err instanceof IngredientNotFoundError) {
        throw new NotFoundException({ code: 'INGREDIENT_NOT_FOUND', ingredientId: err.ingredientId });
      }
      if (err instanceof IngredientOverrideReasonError) {
        throw new BadRequestException({
          code: 'INGREDIENT_OVERRIDE_REASON_TOO_SHORT',
          minLength: err.minLength,
        });
      }
      if (err instanceof IngredientOverrideUnknownFieldError) {
        throw new BadRequestException({
          code: 'INGREDIENT_OVERRIDE_UNKNOWN_FIELD',
          field: err.field,
        });
      }
      throw err;
    }
  }

  @Post()
  @Roles('OWNER', 'MANAGER')
  @AuditAggregate('ingredient', null)
  @ApiOperation({
    summary: 'Create a new ingredient',
    description: 'baseUnitType is immutable post-creation. internalCode auto-generated if not provided.',
  })
  async create(@Body() dto: CreateIngredientDto): Promise<WriteResponseDto<IngredientResponseDto>> {
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
      return toWriteResponse(IngredientResponseDto.fromEntity(saved));
    } catch (err) {
      if (err instanceof QueryFailedError && /uq_ingredients_org_internal_code/.test(err.message)) {
        throw new ConflictException({ code: 'INGREDIENT_DUPLICATE_INTERNAL_CODE' });
      }
      throw err;
    }
  }

  @Patch(':id')
  @Roles('OWNER', 'MANAGER')
  @AuditAggregate('ingredient')
  @ApiOperation({ summary: 'Update an ingredient (mutable fields only)' })
  async update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateIngredientDto,
  ): Promise<WriteResponseDto<IngredientResponseDto>> {
    const i = await this.ingredients.findOneBy({ id });
    if (!i) throw new NotFoundException({ code: 'INGREDIENT_NOT_FOUND' });
    i.applyUpdate(dto);
    const saved = await this.ingredients.save(i);
    return toWriteResponse(IngredientResponseDto.fromEntity(saved));
  }

  @Delete(':id')
  @Roles('OWNER', 'MANAGER')
  @AuditAggregate('ingredient')
  @ApiOperation({
    summary: 'Soft-delete an ingredient (sets isActive=false)',
    description: 'Idempotent. Recipes referring to this ingredient continue to read it (read-side soft-delete).',
  })
  async deactivate(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<WriteResponseDto<{ id: string }>> {
    const i = await this.ingredients.findOneBy({ id });
    if (!i) throw new NotFoundException({ code: 'INGREDIENT_NOT_FOUND' });
    i.deactivate();
    await this.ingredients.save(i);
    return toWriteResponse({ id });
  }

  @Post(':id/reactivate')
  @Roles('OWNER', 'MANAGER')
  @AuditAggregate('ingredient')
  @ApiOperation({ summary: 'Reactivate a previously soft-deleted ingredient' })
  async reactivate(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<WriteResponseDto<{ id: string }>> {
    const i = await this.ingredients.findOneBy({ id });
    if (!i) throw new NotFoundException({ code: 'INGREDIENT_NOT_FOUND' });
    i.reactivate();
    await this.ingredients.save(i);
    return toWriteResponse({ id });
  }

  @Post('import')
  @Roles('OWNER', 'MANAGER')
  @AuditAggregate('ingredient', null)
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
  ): Promise<WriteResponseDto<ImportResult>> {
    if (!file) {
      throw new BadRequestException({ code: 'CSV_IMPORT_INVALID_FORMAT', detail: 'no file uploaded' });
    }
    try {
      const stream = Readable.from(file.buffer);
      const result = await this.importService.parseAndCommit(stream, {
        organizationId,
        dryRun: dryRun ?? false,
      });
      return toWriteResponse(result);
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
