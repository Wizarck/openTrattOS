import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Location } from './domain/location.entity';
import { Organization } from './domain/organization.entity';
import { User } from './domain/user.entity';
import { UserLocation } from './domain/user-location.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Organization, User, Location, UserLocation])],
  exports: [TypeOrmModule],
})
export class IamModule {}
