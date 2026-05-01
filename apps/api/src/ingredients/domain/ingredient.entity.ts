import { randomUUID } from 'node:crypto';
import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export type BaseUnitType = 'WEIGHT' | 'VOLUME' | 'UNIT';
const BASE_UNIT_TYPES: readonly BaseUnitType[] = ['WEIGHT', 'VOLUME', 'UNIT'];

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface IngredientCreateProps {
  organizationId: string;
  categoryId: string;
  name: string;
  baseUnitType: BaseUnitType;
  internalCode?: string;
  densityFactor?: number | null;
  notes?: string | null;
}

export interface IngredientUpdateProps {
  categoryId?: string;
  name?: string;
  internalCode?: string;
  densityFactor?: number | null;
  notes?: string | null;
}

@Entity({ name: 'ingredients' })
@Index('uq_ingredients_org_internal_code', ['organizationId', 'internalCode'], { unique: true })
@Index('ix_ingredients_organization_id', ['organizationId'])
@Index('ix_ingredients_category_id', ['categoryId'])
@Index('ix_ingredients_is_active', ['isActive'])
export class Ingredient {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'category_id', type: 'uuid' })
  categoryId!: string;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ name: 'internal_code', type: 'varchar', length: 64 })
  internalCode!: string;

  @Column({ name: 'base_unit_type', type: 'varchar', length: 16 })
  baseUnitType!: BaseUnitType;

  @Column({ name: 'density_factor', type: 'double precision', nullable: true })
  densityFactor: number | null = null;

  @Column({ type: 'text', nullable: true })
  notes: string | null = null;

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

  static create(props: IngredientCreateProps): Ingredient {
    Ingredient.validateUuid('organizationId', props.organizationId);
    Ingredient.validateUuid('categoryId', props.categoryId);
    Ingredient.validateName(props.name);
    Ingredient.validateBaseUnitType(props.baseUnitType);
    Ingredient.validateDensity(props.baseUnitType, props.densityFactor ?? null);

    const id = randomUUID();
    const ing = new Ingredient();
    ing.id = id;
    ing.organizationId = props.organizationId;
    ing.categoryId = props.categoryId;
    ing.name = props.name.trim();
    ing.internalCode = props.internalCode ? props.internalCode.trim() : Ingredient.autoCode(props.name, id);
    ing.baseUnitType = props.baseUnitType;
    ing.densityFactor = props.densityFactor ?? null;
    ing.notes = props.notes ?? null;
    ing.isActive = true;

    if (ing.internalCode.length === 0) {
      throw new Error('Ingredient.internalCode must be a non-empty string');
    }
    return ing;
  }

  applyUpdate(
    patch: IngredientUpdateProps & { organizationId?: string; baseUnitType?: BaseUnitType },
  ): void {
    if ('organizationId' in patch && patch.organizationId !== undefined) {
      throw new Error('Ingredient.organizationId is immutable; cannot reassign across tenants');
    }
    if ('baseUnitType' in patch && patch.baseUnitType !== undefined) {
      throw new Error('Ingredient.baseUnitType is immutable post-creation (changing units would corrupt cost/recipe history)');
    }
    if (patch.categoryId !== undefined) {
      Ingredient.validateUuid('categoryId', patch.categoryId);
      this.categoryId = patch.categoryId;
    }
    if (patch.name !== undefined) {
      Ingredient.validateName(patch.name);
      this.name = patch.name.trim();
    }
    if (patch.internalCode !== undefined) {
      const code = patch.internalCode.trim();
      if (code.length === 0) throw new Error('Ingredient.internalCode must be a non-empty string');
      this.internalCode = code;
    }
    if (patch.densityFactor !== undefined) {
      Ingredient.validateDensity(this.baseUnitType, patch.densityFactor);
      this.densityFactor = patch.densityFactor;
    }
    if (patch.notes !== undefined) {
      this.notes = patch.notes;
    }
  }

  deactivate(): void {
    this.isActive = false;
  }

  reactivate(): void {
    this.isActive = true;
  }

  private static validateUuid(field: string, value: string): void {
    if (typeof value !== 'string' || !UUID_RX.test(value)) {
      throw new Error(`Ingredient.${field} must be a UUID; got "${value}"`);
    }
  }

  private static validateName(name: string): void {
    if (typeof name !== 'string' || name.trim().length === 0) {
      throw new Error('Ingredient.name must be a non-empty string');
    }
  }

  private static validateBaseUnitType(type: BaseUnitType): void {
    if (!BASE_UNIT_TYPES.includes(type)) {
      throw new Error(`Ingredient.baseUnitType must be one of ${BASE_UNIT_TYPES.join(', ')}; got "${type}"`);
    }
  }

  private static validateDensity(baseUnitType: BaseUnitType, density: number | null): void {
    if (density === null || density === undefined) return;
    if (baseUnitType === 'UNIT') {
      throw new Error('Ingredient.densityFactor is forbidden for UNIT family (count is dimensionless)');
    }
    if (!Number.isFinite(density) || density <= 0) {
      throw new Error(`Ingredient.densityFactor must be a positive finite number (g/ml); got ${density}`);
    }
  }

  private static autoCode(name: string, id: string): string {
    const slug = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32);
    const suffix = id.replace(/-/g, '').slice(0, 6);
    return slug ? `${slug}-${suffix}` : suffix;
  }
}
