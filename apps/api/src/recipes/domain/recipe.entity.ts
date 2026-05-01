import { randomUUID } from 'node:crypto';
import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface RecipeCreateProps {
  organizationId: string;
  name: string;
  description: string;
  wasteFactor: number;
  notes?: string | null;
}

export interface RecipeUpdateProps {
  name?: string;
  description?: string;
  notes?: string | null;
  wasteFactor?: number;
}

@Entity({ name: 'recipes' })
@Index('ix_recipes_organization_id', ['organizationId'])
@Index('ix_recipes_organization_active', ['organizationId', 'isActive'])
export class Recipe {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null = null;

  @Column({ name: 'waste_factor', type: 'numeric', precision: 5, scale: 4 })
  wasteFactor!: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean = true;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null = null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null = null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  static create(props: RecipeCreateProps): Recipe {
    Recipe.validateUuid('organizationId', props.organizationId);
    Recipe.validateName(props.name);
    Recipe.validateWasteFactor(props.wasteFactor);

    const r = new Recipe();
    r.id = randomUUID();
    r.organizationId = props.organizationId;
    r.name = props.name.trim();
    r.description = props.description ?? '';
    r.notes = props.notes ?? null;
    r.wasteFactor = props.wasteFactor;
    r.isActive = true;
    return r;
  }

  applyUpdate(patch: RecipeUpdateProps & { organizationId?: string }): void {
    if ('organizationId' in patch && patch.organizationId !== undefined) {
      throw new Error('Recipe.organizationId is immutable; cannot reassign across tenants');
    }
    if (patch.name !== undefined) {
      Recipe.validateName(patch.name);
      this.name = patch.name.trim();
    }
    if (patch.description !== undefined) {
      this.description = patch.description;
    }
    if (patch.notes !== undefined) {
      this.notes = patch.notes;
    }
    if (patch.wasteFactor !== undefined) {
      Recipe.validateWasteFactor(patch.wasteFactor);
      this.wasteFactor = patch.wasteFactor;
    }
  }

  activate(): void {
    this.isActive = true;
  }

  deactivate(): void {
    this.isActive = false;
  }

  private static validateUuid(field: string, value: string): void {
    if (typeof value !== 'string' || !UUID_RX.test(value)) {
      throw new Error(`Recipe.${field} must be a UUID; got "${value}"`);
    }
  }

  private static validateName(name: string): void {
    if (typeof name !== 'string' || name.trim().length === 0) {
      throw new Error('Recipe.name must be a non-empty string');
    }
  }

  private static validateWasteFactor(w: number): void {
    if (!Number.isFinite(w) || w < 0 || w >= 1) {
      throw new Error(`Recipe.wasteFactor must be a finite number in [0, 1); got ${w}`);
    }
  }
}
