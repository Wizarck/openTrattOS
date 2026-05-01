import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Location } from '../domain/location.entity';

@Injectable()
export class LocationRepository extends Repository<Location> {
  constructor(@InjectDataSource() dataSource: DataSource) {
    super(Location, dataSource.createEntityManager());
  }

  async findByOrganization(organizationId: string): Promise<Location[]> {
    return this.findBy({ organizationId });
  }

  async findActiveByOrganization(organizationId: string): Promise<Location[]> {
    return this.findBy({ organizationId, isActive: true });
  }

  async findManyByIds(ids: string[]): Promise<Location[]> {
    if (ids.length === 0) {
      return [];
    }
    return this.findBy({ id: In(ids) });
  }
}
