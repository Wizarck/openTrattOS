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
import { Location } from '../domain/location.entity';
import { LocationRepository } from '../infrastructure/location.repository';
import { CreateLocationDto, LocationResponseDto, UpdateLocationDto } from './dto/location.dto';

@ApiTags('Locations')
@Controller('locations')
export class LocationController {
  constructor(private readonly locations: LocationRepository) {}

  @Post()
  @Roles('OWNER', 'MANAGER')
  @AuditAggregate('location', null)
  @ApiOperation({ summary: 'Create a new location for an organization' })
  async create(@Body() dto: CreateLocationDto): Promise<WriteResponseDto<LocationResponseDto>> {
    const loc = Location.create({
      organizationId: dto.organizationId,
      name: dto.name,
      address: dto.address ?? '',
      type: dto.type,
    });
    const saved = await this.locations.save(loc);
    return toWriteResponse(LocationResponseDto.fromEntity(saved));
  }

  @Get(':id')
  @Roles('OWNER', 'MANAGER', 'STAFF')
  @ApiOperation({ summary: 'Get a location by id' })
  async getById(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string): Promise<LocationResponseDto> {
    const l = await this.locations.findOneBy({ id });
    if (!l) throw new NotFoundException({ code: 'LOCATION_NOT_FOUND' });
    return LocationResponseDto.fromEntity(l);
  }

  @Get()
  @Roles('OWNER', 'MANAGER', 'STAFF')
  @ApiOperation({ summary: 'List active locations for an organization' })
  async list(
    @Query('organizationId', new ParseUUIDPipe({ version: '4' })) organizationId: string,
    @Query('includeInactive') includeInactive?: string,
  ): Promise<LocationResponseDto[]> {
    const rows = includeInactive === 'true'
      ? await this.locations.findByOrganization(organizationId)
      : await this.locations.findActiveByOrganization(organizationId);
    return rows.map(LocationResponseDto.fromEntity);
  }

  @Patch(':id')
  @Roles('OWNER', 'MANAGER')
  @AuditAggregate('location')
  @ApiOperation({ summary: 'Update a location (mutable fields only)' })
  async update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateLocationDto,
  ): Promise<WriteResponseDto<LocationResponseDto>> {
    const l = await this.locations.findOneBy({ id });
    if (!l) throw new NotFoundException({ code: 'LOCATION_NOT_FOUND' });
    l.applyUpdate(dto);
    const saved = await this.locations.save(l);
    return toWriteResponse(LocationResponseDto.fromEntity(saved));
  }

  @Delete(':id')
  @Roles('OWNER', 'MANAGER')
  @AuditAggregate('location')
  @ApiOperation({
    summary: 'Soft-delete a location (sets isActive=false)',
    description: 'Idempotent. Historical references survive — see soft-delete policy in data-model.md §2.1.',
  })
  async deactivate(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<WriteResponseDto<{ id: string }>> {
    const l = await this.locations.findOneBy({ id });
    if (!l) throw new NotFoundException({ code: 'LOCATION_NOT_FOUND' });
    l.deactivate();
    await this.locations.save(l);
    return toWriteResponse({ id });
  }
}
