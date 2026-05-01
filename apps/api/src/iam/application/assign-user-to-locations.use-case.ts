import { Injectable } from '@nestjs/common';
import { LocationRepository } from '../infrastructure/location.repository';
import { UserLocationRepository } from '../infrastructure/user-location.repository';
import { UserRepository } from '../infrastructure/user.repository';
import { UserLocation } from '../domain/user-location.entity';

export class TenantBoundaryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenantBoundaryError';
  }
}

export interface AssignUserToLocationsInput {
  userId: string;
  locationIds: string[];
}

@Injectable()
export class AssignUserToLocations {
  constructor(
    private readonly users: UserRepository,
    private readonly locations: LocationRepository,
    private readonly assignments: UserLocationRepository,
  ) {}

  /**
   * Replaces the user's full set of location assignments with the given list.
   * Cross-tenant attempts (locations belonging to a different organization
   * than the user) raise TenantBoundaryError before any DB write.
   */
  async execute(input: AssignUserToLocationsInput): Promise<UserLocation[]> {
    const user = await this.users.findOneBy({ id: input.userId });
    if (!user) {
      throw new Error(`User not found: ${input.userId}`);
    }

    if (input.locationIds.length === 0) {
      await this.assignments.delete({ userId: user.id });
      return [];
    }

    const locations = await this.locations.findManyByIds(input.locationIds);
    if (locations.length !== input.locationIds.length) {
      const foundIds = new Set(locations.map((l) => l.id));
      const missing = input.locationIds.filter((id) => !foundIds.has(id));
      throw new Error(`Location(s) not found: ${missing.join(', ')}`);
    }

    const foreign = locations.filter((l) => l.organizationId !== user.organizationId);
    if (foreign.length > 0) {
      throw new TenantBoundaryError(
        `Cannot assign user ${user.id} (org ${user.organizationId}) to locations from other tenants: ${foreign
          .map((l) => `${l.id}@${l.organizationId}`)
          .join(', ')}`,
      );
    }

    return this.assignments.replaceForUser(user.id, input.locationIds);
  }
}
