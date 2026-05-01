import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Organization, OrganizationUpdateProps } from '../domain/organization.entity';

@Injectable()
export class OrganizationRepository extends Repository<Organization> {
  constructor(@InjectDataSource() dataSource: DataSource) {
    super(Organization, dataSource.createEntityManager());
  }

  async findByIdOrThrow(id: string): Promise<Organization> {
    const org = await this.findOneBy({ id });
    if (!org) {
      throw new Error(`Organization not found: ${id}`);
    }
    return org;
  }

  /**
   * Updates a subset of mutable fields. currencyCode is silently stripped if
   * present in the patch — the domain rejects it via applyUpdate but the
   * repository is the second line of defence (D6 / ADR-007 immutability).
   */
  async updateMutable(
    id: string,
    patch: OrganizationUpdateProps & { currencyCode?: string },
  ): Promise<Organization> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { currencyCode: _stripped, ...allowed } = patch;
    const org = await this.findByIdOrThrow(id);
    org.applyUpdate(allowed);
    return this.save(org);
  }
}
