import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { UserLocation } from '../domain/user-location.entity';

@Injectable()
export class UserLocationRepository extends Repository<UserLocation> {
  constructor(@InjectDataSource() dataSource: DataSource) {
    super(UserLocation, dataSource.createEntityManager());
  }

  async findByUser(userId: string): Promise<UserLocation[]> {
    return this.findBy({ userId });
  }

  async findByLocation(locationId: string): Promise<UserLocation[]> {
    return this.findBy({ locationId });
  }

  async deleteByUserAndLocations(userId: string, locationIds: string[]): Promise<void> {
    if (locationIds.length === 0) return;
    await this.delete({ userId, locationId: In(locationIds) });
  }

  async replaceForUser(userId: string, locationIds: string[]): Promise<UserLocation[]> {
    await this.delete({ userId });
    if (locationIds.length === 0) return [];
    const rows = locationIds.map((locationId) => UserLocation.create({ userId, locationId }));
    return this.save(rows);
  }
}
