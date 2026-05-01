import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Organization, OrganizationCreateProps } from '../domain/organization.entity';
import { seedDefaultCategories } from '../../ingredients/infrastructure/category-seed';

export interface CreateOrganizationResult {
  organization: Organization;
  seededCategoryCount: number;
}

@Injectable()
export class CreateOrganization {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Creates an Organization and seeds the default category taxonomy in a
   * single transaction. If the seed fails, the org insert is rolled back.
   */
  async execute(
    props: OrganizationCreateProps,
    actorUserId?: string,
  ): Promise<CreateOrganizationResult> {
    return this.dataSource.transaction(async (em) => {
      const org = Organization.create(props);
      if (actorUserId) {
        org.createdBy = actorUserId;
        org.updatedBy = actorUserId;
      }
      const saved = await em.getRepository(Organization).save(org);
      const seededCategoryCount = await seedDefaultCategories(em, saved.id, { actorUserId });
      return { organization: saved, seededCategoryCount };
    });
  }
}
