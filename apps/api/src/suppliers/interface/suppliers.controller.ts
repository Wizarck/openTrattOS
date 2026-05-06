import {
  Body,
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
import { AuditAggregate } from '../../shared/decorators/audit-aggregate.decorator';
import { Roles } from '../../shared/decorators/roles.decorator';
import {
  WriteResponseDto,
  toWriteResponse,
} from '../../shared/dto/write-response.dto';
import { Supplier } from '../domain/supplier.entity';
import { SupplierRepository } from '../infrastructure/supplier.repository';
import { CreateSupplierDto, SupplierResponseDto, UpdateSupplierDto } from './dto/supplier.dto';

@ApiTags('Suppliers')
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliers: SupplierRepository) {}

  @Get()
  @Roles('OWNER', 'MANAGER', 'STAFF')
  @ApiOperation({ summary: 'List active suppliers for an organization' })
  async list(
    @Query('organizationId', new ParseUUIDPipe({ version: '4' })) organizationId: string,
    @Query('includeInactive') includeInactive?: string,
  ): Promise<SupplierResponseDto[]> {
    const rows = includeInactive === 'true'
      ? await this.suppliers.findBy({ organizationId })
      : await this.suppliers.findActiveByOrganization(organizationId);
    return rows.map(SupplierResponseDto.fromEntity);
  }

  @Get(':id')
  @Roles('OWNER', 'MANAGER', 'STAFF')
  @ApiOperation({ summary: 'Get a supplier by id' })
  async getById(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string): Promise<SupplierResponseDto> {
    const s = await this.suppliers.findOneBy({ id });
    if (!s) throw new NotFoundException({ code: 'SUPPLIER_NOT_FOUND' });
    return SupplierResponseDto.fromEntity(s);
  }

  @Post()
  @Roles('OWNER', 'MANAGER')
  @AuditAggregate('supplier', null)
  @ApiOperation({ summary: 'Create a new supplier' })
  async create(@Body() dto: CreateSupplierDto): Promise<WriteResponseDto<SupplierResponseDto>> {
    const s = Supplier.create({
      organizationId: dto.organizationId,
      name: dto.name,
      country: dto.country,
      contactName: dto.contactName,
      email: dto.email,
      phone: dto.phone,
    });
    const saved = await this.suppliers.save(s);
    return toWriteResponse(SupplierResponseDto.fromEntity(saved));
  }

  @Patch(':id')
  @Roles('OWNER', 'MANAGER')
  @AuditAggregate('supplier')
  @ApiOperation({ summary: 'Update a supplier (mutable fields)' })
  async update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateSupplierDto,
  ): Promise<WriteResponseDto<SupplierResponseDto>> {
    const s = await this.suppliers.findOneBy({ id });
    if (!s) throw new NotFoundException({ code: 'SUPPLIER_NOT_FOUND' });
    s.applyUpdate(dto);
    const saved = await this.suppliers.save(s);
    return toWriteResponse(SupplierResponseDto.fromEntity(saved));
  }

  @Delete(':id')
  @Roles('OWNER', 'MANAGER')
  @AuditAggregate('supplier')
  @ApiOperation({ summary: 'Soft-delete a supplier (sets isActive=false)' })
  async deactivate(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<WriteResponseDto<{ id: string }>> {
    const s = await this.suppliers.findOneBy({ id });
    if (!s) throw new NotFoundException({ code: 'SUPPLIER_NOT_FOUND' });
    s.deactivate();
    await this.suppliers.save(s);
    return toWriteResponse({ id });
  }
}
