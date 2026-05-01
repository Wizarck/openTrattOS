import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Supplier } from '../domain/supplier.entity';

@Injectable()
export class SupplierRepository extends Repository<Supplier> {
  constructor(@InjectDataSource() dataSource: DataSource) {
    super(Supplier, dataSource.createEntityManager());
  }

  async findActiveByOrganization(organizationId: string): Promise<Supplier[]> {
    return this.findBy({ organizationId, isActive: true });
  }
}
