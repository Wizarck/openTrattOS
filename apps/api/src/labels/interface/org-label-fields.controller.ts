import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { AuditAggregate } from '../../shared/decorators/audit-aggregate.decorator';
import { Roles } from '../../shared/decorators/roles.decorator';
import {
  WriteResponseDto,
  toWriteResponse,
} from '../../shared/dto/write-response.dto';
import {
  Organization,
  type OrganizationLabelFields,
} from '../../iam/domain/organization.entity';
import { LabelFieldsResponseDto, UpdateLabelFieldsDto } from './dto/label-fields.dto';

/**
 * Owner-configurable label fields. Persisted as the `Org.labelFields` jsonb
 * column. Article 9 mandatory-field validation runs at label render time —
 * this endpoint accepts partial config so an Owner can incrementally fill in
 * the form across multiple sessions.
 */
@ApiTags('Organizations — label fields')
@Controller('organizations')
export class OrgLabelFieldsController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get(':id/label-fields')
  @Roles('OWNER', 'MANAGER')
  @ApiOperation({ summary: 'Get an org\'s label-rendering field config' })
  async getLabelFields(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<LabelFieldsResponseDto> {
    const org = await this.dataSource.getRepository(Organization).findOneBy({ id });
    if (!org) throw new NotFoundException({ code: 'ORGANIZATION_NOT_FOUND' });
    return LabelFieldsResponseDto.fromEntity(org);
  }

  @Put(':id/label-fields')
  @Roles('OWNER')
  @AuditAggregate('organization')
  @ApiOperation({
    summary: 'Replace the org\'s label-rendering field config (Owner only)',
    description:
      'Partial config is accepted at this endpoint; mandatory-field validation per EU 1169/2011 Article 9 runs only at label render time so Owner can fill the config incrementally.',
  })
  async putLabelFields(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateLabelFieldsDto,
  ): Promise<WriteResponseDto<LabelFieldsResponseDto>> {
    const org = await this.dataSource.getRepository(Organization).findOneBy({ id });
    if (!org) throw new NotFoundException({ code: 'ORGANIZATION_NOT_FOUND' });
    const next: OrganizationLabelFields = {
      ...org.labelFields,
      ...(dto.businessName !== undefined ? { businessName: dto.businessName } : {}),
      ...(dto.contactInfo !== undefined ? { contactInfo: dto.contactInfo } : {}),
      ...(dto.postalAddress !== undefined ? { postalAddress: dto.postalAddress } : {}),
      ...(dto.brandMarkUrl !== undefined ? { brandMarkUrl: dto.brandMarkUrl } : {}),
      ...(dto.pageSize !== undefined ? { pageSize: dto.pageSize } : {}),
      ...(dto.printAdapter !== undefined
        ? { printAdapter: { id: dto.printAdapter.id, config: dto.printAdapter.config } }
        : {}),
    };
    org.labelFields = next;
    await this.dataSource.getRepository(Organization).save(org);
    return toWriteResponse(LabelFieldsResponseDto.fromEntity(org));
  }
}
