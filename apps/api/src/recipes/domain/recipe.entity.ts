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
  /** Number of portions the Recipe yields. Defaults to 1 if omitted. Must be >= 1. */
  portions?: number;
}

export interface RecipeUpdateProps {
  name?: string;
  description?: string;
  notes?: string | null;
  wasteFactor?: number;
  portions?: number;
}

/** Manager+ override on Recipe-level aggregated allergens. Persisted as jsonb. */
export interface AllergensOverride {
  /** Allergens to add to the conservatively-aggregated set. */
  add: string[];
  /** Allergens to remove from the conservatively-aggregated set. */
  remove: string[];
  /** Audit reason for the override (required, non-empty). */
  reason: string;
  /** UUID of the actor (Manager+) who applied the override. */
  appliedBy: string;
  /** ISO-8601 UTC timestamp when the override was applied. */
  appliedAt: string;
}

/** Manager+ override on Recipe-level inferred diet flags. Persisted as jsonb. */
export interface DietFlagsOverride {
  /** The diet-flag set the Manager declares true for the Recipe (replaces inferred). */
  flags: string[];
  /** Audit reason for the override (required, non-empty). */
  reason: string;
  /** UUID of the actor (Manager+) who applied the override. */
  appliedBy: string;
  /** ISO-8601 UTC timestamp when the override was applied. */
  appliedAt: string;
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

  /**
   * Number of portions the Recipe yields. Used by the label renderer to derive
   * "net quantity per portion" from the total walked tree mass. Must be >= 1.
   */
  @Column({ type: 'integer', default: 1 })
  portions: number = 1;

  // M2 allergens-article-21 extensions (additive — see openspec/changes/m2-allergens-article-21/).
  // Aggregation itself is read-time per design.md (never stored on Recipe). The
  // four columns below carry: (a) Manager+ override on the aggregated allergen
  // list, (b) Manager+ override on the inferred diet flags, and (c) the
  // cross-contamination note + structured tag list ("may contain traces of X").

  /**
   * Manager+ override applied on top of the read-time aggregation. Shape:
   * `{ add: string[], remove: string[], reason: string, appliedBy: uuid, appliedAt: ISOstring }`.
   * Final list = (aggregated ∪ add) − remove. Null when no override is in effect.
   */
  @Column({ name: 'aggregated_allergens_override', type: 'jsonb', nullable: true })
  aggregatedAllergensOverride: AllergensOverride | null = null;

  /**
   * Manager+ override on the conservatively inferred diet flags. Shape:
   * `{ flags: string[], reason: string, appliedBy: uuid, appliedAt: ISOstring }`.
   * Replaces the inferred set wholesale. Null when no override is in effect.
   */
  @Column({ name: 'diet_flags_override', type: 'jsonb', nullable: true })
  dietFlagsOverride: DietFlagsOverride | null = null;

  /**
   * Free-text note describing production-line risk ("Made on shared line with
   * peanuts"). Stored alongside the structured `crossContaminationAllergens`
   * array so audit can distinguish "X is in the recipe" from "X may have
   * touched the recipe in production". Null when no cross-contamination has
   * been recorded.
   */
  @Column({ name: 'cross_contamination_note', type: 'text', nullable: true })
  crossContaminationNote: string | null = null;

  /** Structured allergen tags backing the free-text note. Empty array when none. */
  @Column({
    name: 'cross_contamination_allergens',
    type: 'text',
    array: true,
    default: () => "'{}'",
  })
  crossContaminationAllergens: string[] = [];

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
    if (props.portions !== undefined) Recipe.validatePortions(props.portions);

    const r = new Recipe();
    r.id = randomUUID();
    r.organizationId = props.organizationId;
    r.name = props.name.trim();
    r.description = props.description ?? '';
    r.notes = props.notes ?? null;
    r.wasteFactor = props.wasteFactor;
    r.isActive = true;
    r.portions = props.portions ?? 1;
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
    if (patch.portions !== undefined) {
      Recipe.validatePortions(patch.portions);
      this.portions = patch.portions;
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

  private static validatePortions(p: number): void {
    if (!Number.isInteger(p) || p < 1) {
      throw new Error(`Recipe.portions must be a positive integer; got ${p}`);
    }
  }
}
