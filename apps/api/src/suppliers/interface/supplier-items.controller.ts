import {
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
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { QueryFailedError } from 'typeorm';
import { AuditAggregate } from '../../shared/decorators/audit-aggregate.decorator';
import { Roles } from '../../shared/decorators/roles.decorator';
import {
  WriteResponseDto,
  toWriteResponse,
} from '../../shared/dto/write-response.dto';
import { SUPPLIER_PRICE_UPDATED } from '../../cost/application/cost.events';
import type { AuditEventEnvelope } from '../../audit-log/application/types';
import { IngredientRepository } from '../../ingredients/infrastructure/ingredient.repository';
import { SupplierItem } from '../domain/supplier-item.entity';
import { SupplierItemRepository } from '../infrastructure/supplier-item.repository';
import {
  CreateSupplierItemDto,
  SupplierItemResponseDto,
  UpdateSupplierItemDto,
} from './dto/supplier.dto';

@ApiTags('Supplier Items')
@Controller('supplier-items')
export class SupplierItemsController {
  constructor(
    private readonly supplierItems: SupplierItemRepository,
    private readonly ingredients: IngredientRepository,
    private readonly events: EventEmitter2,
  ) {}

  @Get()
  @Roles('OWNER', 'MANAGER', 'STAFF')
  @ApiOperation({ summary: 'List supplier items for an ingredient' })
  async list(
    @Query('ingredientId', new ParseUUIDPipe({ version: '4' })) ingredientId: string,
  ): Promise<SupplierItemResponseDto[]> {
    const rows = await this.supplierItems.findByIngredient(ingredientId);
    return rows.map(SupplierItemResponseDto.fromEntity);
  }

  @Post()
  @Roles('OWNER', 'MANAGER')
  @AuditAggregate('supplier_item', null)
  @ApiOperation({
    summary: 'Create a supplier item (computes costPerBaseUnit on save)',
    description:
      'purchaseUnitType family must match the ingredient baseUnitType — kg only for WEIGHT, L only for VOLUME, pcs/dozen/box only for UNIT.',
  })
  async create(
    @Body() dto: CreateSupplierItemDto,
  ): Promise<WriteResponseDto<SupplierItemResponseDto>> {
    const ingredient = await this.ingredients.findOneBy({ id: dto.ingredientId });
    if (!ingredient) throw new NotFoundException({ code: 'INGREDIENT_NOT_FOUND' });

    const si = SupplierItem.create({
      supplierId: dto.supplierId,
      ingredientId: dto.ingredientId,
      purchaseUnit: dto.purchaseUnit,
      purchaseUnitQty: dto.purchaseUnitQty,
      purchaseUnitType: dto.purchaseUnitType,
      unitPrice: dto.unitPrice,
      isPreferred: dto.isPreferred ?? false,
    });
    si.costPerBaseUnit = si.computeCostPerBaseUnit(ingredient);

    try {
      const saved = await this.supplierItems.save(si);
      this.events.emit(
        SUPPLIER_PRICE_UPDATED,
        buildSupplierPriceEnvelope(ingredient.organizationId, saved.id, saved.ingredientId),
      );
      return toWriteResponse(SupplierItemResponseDto.fromEntity(saved));
    } catch (err) {
      if (
        err instanceof QueryFailedError &&
        /uq_supplier_items_preferred_per_ingredient/.test(err.message)
      ) {
        throw new ConflictException({ code: 'SUPPLIER_ITEM_PREFERRED_DUPLICATE' });
      }
      throw err;
    }
  }

  @Patch(':id')
  @Roles('OWNER', 'MANAGER')
  @AuditAggregate('supplier_item')
  @ApiOperation({ summary: 'Update a supplier item (recomputes costPerBaseUnit)' })
  async update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateSupplierItemDto,
  ): Promise<WriteResponseDto<SupplierItemResponseDto>> {
    const si = await this.supplierItems.findOneBy({ id });
    if (!si) throw new NotFoundException({ code: 'SUPPLIER_ITEM_NOT_FOUND' });
    si.applyUpdate(dto);
    const ingredient = await this.ingredients.findOneBy({ id: si.ingredientId });
    if (ingredient) {
      si.costPerBaseUnit = si.computeCostPerBaseUnit(ingredient);
    }
    const saved = await this.supplierItems.save(si);
    if (ingredient) {
      this.events.emit(
        SUPPLIER_PRICE_UPDATED,
        buildSupplierPriceEnvelope(ingredient.organizationId, saved.id, saved.ingredientId),
      );
    }
    return toWriteResponse(SupplierItemResponseDto.fromEntity(saved));
  }

  @Post(':id/promote-preferred')
  @Roles('OWNER', 'MANAGER')
  @AuditAggregate('supplier_item')
  @ApiOperation({
    summary: 'Promote this supplier item to preferred (atomically demotes the previous preferred)',
  })
  async promotePreferred(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<WriteResponseDto<SupplierItemResponseDto>> {
    const si = await this.supplierItems.promoteToPreferred(id);
    const ingredient = await this.ingredients.findOneBy({ id: si.ingredientId });
    if (ingredient) {
      this.events.emit(
        SUPPLIER_PRICE_UPDATED,
        buildSupplierPriceEnvelope(ingredient.organizationId, si.id, si.ingredientId),
      );
    }
    return toWriteResponse(SupplierItemResponseDto.fromEntity(si));
  }

  @Delete(':id')
  @Roles('OWNER', 'MANAGER')
  @AuditAggregate('supplier_item')
  @ApiOperation({ summary: 'Delete a supplier item (hard delete; supplier-cost lookup loses this row)' })
  async remove(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<WriteResponseDto<{ id: string }>> {
    const result = await this.supplierItems.delete({ id });
    if ((result.affected ?? 0) === 0) {
      throw new NotFoundException({ code: 'SUPPLIER_ITEM_NOT_FOUND' });
    }
    return toWriteResponse({ id });
  }
}

/**
 * Wave 1.18 — m2-audit-log-emitter-migration. Construct the canonical
 * envelope for SUPPLIER_PRICE_UPDATED. Aggregate is the supplier_item;
 * ingredientId rides along in payloadAfter (cost.service + dashboard.service
 * both read it for cascading invalidation).
 */
function buildSupplierPriceEnvelope(
  organizationId: string,
  supplierItemId: string,
  ingredientId: string,
): AuditEventEnvelope<unknown, { ingredientId: string }> {
  return {
    organizationId,
    aggregateType: 'supplier_item',
    aggregateId: supplierItemId,
    actorUserId: null,
    actorKind: 'system',
    payloadAfter: { ingredientId },
  };
}
