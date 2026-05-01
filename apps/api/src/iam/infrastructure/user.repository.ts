import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { User } from '../domain/user.entity';

@Injectable()
export class UserRepository extends Repository<User> {
  constructor(@InjectDataSource() dataSource: DataSource) {
    super(User, dataSource.createEntityManager());
  }

  async findByEmailAndOrg(email: string, organizationId: string): Promise<User | null> {
    return this.findOneBy({ email: email.trim().toLowerCase(), organizationId });
  }

  async findByOrganization(organizationId: string): Promise<User[]> {
    return this.findBy({ organizationId });
  }
}
