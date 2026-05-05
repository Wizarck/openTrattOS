import { NotFoundException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { OrgLabelFieldsController } from './org-label-fields.controller';
import { Organization } from '../../iam/domain/organization.entity';
import { UpdateLabelFieldsDto } from './dto/label-fields.dto';

const ORG_ID = '11111111-1111-4111-8111-111111111111';

function makeOrg(): Organization {
  const org = new Organization();
  org.id = ORG_ID;
  org.name = 'Org';
  org.currencyCode = 'EUR';
  org.defaultLocale = 'es';
  org.timezone = 'Europe/Madrid';
  org.labelFields = {};
  return org;
}

function makeFakeDataSource(orgs: Map<string, Organization>): {
  dataSource: DataSource;
  saved: Organization[];
} {
  const saved: Organization[] = [];
  const dataSource = {
    getRepository: (entity: unknown) => {
      if (entity === Organization) {
        return {
          findOneBy: async (where: { id: string }) => orgs.get(where.id) ?? null,
          save: async (org: Organization) => {
            saved.push(org);
            orgs.set(org.id, org);
            return org;
          },
        };
      }
      throw new Error(`Unexpected entity: ${String(entity)}`);
    },
  } as unknown as DataSource;
  return { dataSource, saved };
}

describe('OrgLabelFieldsController', () => {
  it('GET returns the org\'s labelFields config', async () => {
    const org = makeOrg();
    org.labelFields = {
      businessName: 'Restaurante',
      pageSize: 'thermal-4x6',
    };
    const { dataSource } = makeFakeDataSource(new Map([[ORG_ID, org]]));
    const controller = new OrgLabelFieldsController(dataSource);
    const result = await controller.getLabelFields(ORG_ID);
    expect(result.organizationId).toBe(ORG_ID);
    expect(result.businessName).toBe('Restaurante');
    expect(result.pageSize).toBe('thermal-4x6');
  });

  it('GET returns 404 when org missing', async () => {
    const { dataSource } = makeFakeDataSource(new Map());
    const controller = new OrgLabelFieldsController(dataSource);
    await expect(controller.getLabelFields(ORG_ID)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('PUT merges partial config + persists', async () => {
    const org = makeOrg();
    org.labelFields = { businessName: 'Old', pageSize: 'a4' };
    const { dataSource, saved } = makeFakeDataSource(new Map([[ORG_ID, org]]));
    const controller = new OrgLabelFieldsController(dataSource);

    const dto = new UpdateLabelFieldsDto();
    dto.businessName = 'Updated';
    // pageSize NOT in dto → preserved

    const result = await controller.putLabelFields(ORG_ID, dto);
    expect(result.businessName).toBe('Updated');
    expect(result.pageSize).toBe('a4');
    expect(saved).toHaveLength(1);
    expect(saved[0].labelFields.businessName).toBe('Updated');
    expect(saved[0].labelFields.pageSize).toBe('a4');
  });

  it('PUT accepts complete config', async () => {
    const org = makeOrg();
    const { dataSource } = makeFakeDataSource(new Map([[ORG_ID, org]]));
    const controller = new OrgLabelFieldsController(dataSource);

    const dto = new UpdateLabelFieldsDto();
    dto.businessName = 'Restaurante';
    dto.pageSize = 'thermal-4x6';
    dto.postalAddress = {
      street: 'Calle 1',
      city: 'Madrid',
      postalCode: '28001',
      country: 'ES',
    };
    dto.printAdapter = { id: 'ipp', config: { url: 'http://printer.local:631/ipp/print' } };

    const result = await controller.putLabelFields(ORG_ID, dto);
    expect(result.businessName).toBe('Restaurante');
    expect(result.pageSize).toBe('thermal-4x6');
    expect(result.postalAddress?.city).toBe('Madrid');
    expect(result.printAdapter?.id).toBe('ipp');
  });

  it('PUT returns 404 when org missing', async () => {
    const { dataSource } = makeFakeDataSource(new Map());
    const controller = new OrgLabelFieldsController(dataSource);
    const dto = new UpdateLabelFieldsDto();
    dto.businessName = 'Anything';
    await expect(controller.putLabelFields(ORG_ID, dto)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
