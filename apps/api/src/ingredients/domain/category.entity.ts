import { randomUUID } from 'node:crypto';
import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface CategoryCreateProps {
  organizationId: string;
  parentId: string | null;
  name: string;
  nameEs: string;
  nameEn: string;
  sortOrder?: number;
}

export interface CategoryUpdateProps {
  parentId?: string | null;
  name?: string;
  nameEs?: string;
  nameEn?: string;
  sortOrder?: number;
}

@Entity({ name: 'categories' })
@Index('uq_categories_org_parent_name', ['organizationId', 'parentId', 'name'], { unique: true })
@Index('ix_categories_organization_id', ['organizationId'])
@Index('ix_categories_parent_id', ['parentId'])
export class Category {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId: string | null = null;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ name: 'name_es', type: 'varchar', length: 200 })
  nameEs!: string;

  @Column({ name: 'name_en', type: 'varchar', length: 200 })
  nameEn!: string;

  @Column({ name: 'sort_order', type: 'integer', default: 0 })
  sortOrder: number = 0;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault: boolean = false;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null = null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null = null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  static create(props: CategoryCreateProps): Category {
    Category.validateUuid('organizationId', props.organizationId);
    if (props.parentId !== null && props.parentId !== undefined) {
      Category.validateUuid('parentId', props.parentId);
    }
    Category.validateName('name', props.name);
    Category.validateName('nameEs', props.nameEs);
    Category.validateName('nameEn', props.nameEn);
    const sortOrder = props.sortOrder ?? 0;
    if (!Number.isInteger(sortOrder) || sortOrder < 0) {
      throw new Error(`Category.sortOrder must be a non-negative integer; got ${sortOrder}`);
    }

    const cat = new Category();
    cat.id = randomUUID();
    cat.organizationId = props.organizationId;
    cat.parentId = props.parentId ?? null;
    cat.name = props.name.trim();
    cat.nameEs = props.nameEs.trim();
    cat.nameEn = props.nameEn.trim();
    cat.sortOrder = sortOrder;
    cat.isDefault = false;
    return cat;
  }

  static createSeedDefault(props: CategoryCreateProps): Category {
    const cat = Category.create(props);
    cat.isDefault = true;
    return cat;
  }

  applyUpdate(
    patch: CategoryUpdateProps & { organizationId?: string; isDefault?: boolean },
  ): void {
    if ('organizationId' in patch && patch.organizationId !== undefined) {
      throw new Error('Category.organizationId is immutable; cannot reassign across tenants');
    }
    if ('isDefault' in patch && patch.isDefault !== undefined) {
      throw new Error('Category.isDefault is set only by seed; cannot flip via update');
    }
    if (patch.parentId !== undefined) {
      if (patch.parentId !== null) {
        Category.validateUuid('parentId', patch.parentId);
        if (patch.parentId === this.id) {
          throw new Error('Category cannot be its own parent (self-parent forbidden)');
        }
      }
      this.parentId = patch.parentId;
    }
    if (patch.name !== undefined) {
      Category.validateName('name', patch.name);
      this.name = patch.name.trim();
    }
    if (patch.nameEs !== undefined) {
      Category.validateName('nameEs', patch.nameEs);
      this.nameEs = patch.nameEs.trim();
    }
    if (patch.nameEn !== undefined) {
      Category.validateName('nameEn', patch.nameEn);
      this.nameEn = patch.nameEn.trim();
    }
    if (patch.sortOrder !== undefined) {
      if (!Number.isInteger(patch.sortOrder) || patch.sortOrder < 0) {
        throw new Error(`Category.sortOrder must be a non-negative integer; got ${patch.sortOrder}`);
      }
      this.sortOrder = patch.sortOrder;
    }
  }

  private static validateUuid(field: string, value: string): void {
    if (typeof value !== 'string' || !UUID_RX.test(value)) {
      throw new Error(`Category.${field} must be a UUID; got "${value}"`);
    }
  }

  private static validateName(field: string, value: string): void {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(`Category.${field} must be a non-empty string`);
    }
  }
}
