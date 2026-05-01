import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssignUserToLocations } from './application/assign-user-to-locations.use-case';
import { CreateOrganization } from './application/create-organization.use-case';
import { Location } from './domain/location.entity';
import { Organization } from './domain/organization.entity';
import { User } from './domain/user.entity';
import { UserLocation } from './domain/user-location.entity';
import { LocationRepository } from './infrastructure/location.repository';
import { OrganizationRepository } from './infrastructure/organization.repository';
import { UserLocationRepository } from './infrastructure/user-location.repository';
import { UserRepository } from './infrastructure/user.repository';

@Module({
  imports: [TypeOrmModule.forFeature([Organization, User, Location, UserLocation])],
  providers: [
    OrganizationRepository,
    UserRepository,
    LocationRepository,
    UserLocationRepository,
    CreateOrganization,
    AssignUserToLocations,
  ],
  exports: [
    OrganizationRepository,
    UserRepository,
    LocationRepository,
    UserLocationRepository,
    CreateOrganization,
    AssignUserToLocations,
  ],
})
export class IamModule {}
