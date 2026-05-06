import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditAggregate } from '../../shared/decorators/audit-aggregate.decorator';
import { Roles } from '../../shared/decorators/roles.decorator';
import {
  WriteResponseDto,
  toWriteResponse,
} from '../../shared/dto/write-response.dto';
import { CreateOrganization } from '../application/create-organization.use-case';
import { OrganizationRepository } from '../infrastructure/organization.repository';
import { CreateOrganizationDto, OrganizationResponseDto, UpdateOrganizationDto } from './dto/organization.dto';

@ApiTags('Organizations')
@Controller('organizations')
export class OrganizationController {
  constructor(
    private readonly organizations: OrganizationRepository,
    private readonly createOrg: CreateOrganization,
  ) {}

  @Post()
  @Roles('OWNER')
  @AuditAggregate('organization', null)
  @ApiOperation({
    summary: 'Create a new organization (and seed its default category taxonomy)',
    description:
      'Creates an Organization in a single transaction with the 35-row default taxonomy seed (PRD-M1 §Appendix A). Currency is immutable after this call (ADR-007).',
  })
  async create(@Body() dto: CreateOrganizationDto): Promise<WriteResponseDto<OrganizationResponseDto>> {
    const result = await this.createOrg.execute(dto);
    return toWriteResponse(OrganizationResponseDto.fromEntity(result.organization));
  }

  @Get(':id')
  @Roles('OWNER', 'MANAGER', 'STAFF')
  @ApiOperation({ summary: 'Get an organization by id' })
  async getById(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string): Promise<OrganizationResponseDto> {
    const org = await this.organizations.findOneBy({ id });
    if (!org) throw new NotFoundException({ code: 'ORGANIZATION_NOT_FOUND' });
    return OrganizationResponseDto.fromEntity(org);
  }

  @Patch(':id')
  @Roles('OWNER')
  @AuditAggregate('organization')
  @ApiOperation({
    summary: 'Update an organization (mutable fields only)',
    description: 'currencyCode is silently stripped — see ADR-007 / D6 immutability.',
  })
  async update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateOrganizationDto,
  ): Promise<WriteResponseDto<OrganizationResponseDto>> {
    const updated = await this.organizations.updateMutable(id, dto);
    return toWriteResponse(OrganizationResponseDto.fromEntity(updated));
  }
}
