import { Injectable } from '@nestjs/common';
import { Organization, OrganizationCreateProps } from '../domain/organization.entity';
import { OrganizationRepository } from '../infrastructure/organization.repository';

@Injectable()
export class CreateOrganization {
  constructor(private readonly organizations: OrganizationRepository) {}

  async execute(props: OrganizationCreateProps, actorUserId?: string): Promise<Organization> {
    const org = Organization.create(props);
    if (actorUserId) {
      org.createdBy = actorUserId;
      org.updatedBy = actorUserId;
    }
    return this.organizations.save(org);
  }
}
