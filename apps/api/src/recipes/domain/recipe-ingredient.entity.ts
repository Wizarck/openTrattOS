import { randomUUID } from 'node:crypto';
import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface RecipeIngredientCreateProps {
  recipeId: string;
  ingredientId: string | null;
  subRecipeId: string | null;
  quantity: number;
  unitId: string;
  yieldPercentOverride?: number | null;
  sourceOverrideRef?: string | null;
}

export interface RecipeIngredientUpdateProps {
  quantity?: number;
  unitId?: string;
  yieldPercentOverride?: number | null;
  sourceOverrideRef?: string | null;
}

@Entity({ name: 'recipe_ingredients' })
@Index('ix_recipe_ingredients_recipe_id', ['recipeId'])
@Index('ix_recipe_ingredients_ingredient_id', ['ingredientId'])
@Index('ix_recipe_ingredients_sub_recipe_id', ['subRecipeId'])
export class RecipeIngredient {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'recipe_id', type: 'uuid' })
  recipeId!: string;

  @Column({ name: 'ingredient_id', type: 'uuid', nullable: true })
  ingredientId: string | null = null;

  @Column({ name: 'sub_recipe_id', type: 'uuid', nullable: true })
  subRecipeId: string | null = null;

  @Column({ type: 'numeric', precision: 14, scale: 4 })
  quantity!: number;

  @Column({ name: 'unit_id', type: 'varchar', length: 16 })
  unitId!: string;

  @Column({ name: 'yield_percent_override', type: 'numeric', precision: 5, scale: 4, nullable: true })
  yieldPercentOverride: number | null = null;

  @Column({ name: 'source_override_ref', type: 'varchar', length: 200, nullable: true })
  sourceOverrideRef: string | null = null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null = null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null = null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  static create(props: RecipeIngredientCreateProps): RecipeIngredient {
    RecipeIngredient.validateUuid('recipeId', props.recipeId);
    RecipeIngredient.validateComposite(props.ingredientId, props.subRecipeId);
    RecipeIngredient.validatePositive('quantity', props.quantity);
    RecipeIngredient.validateUnit(props.unitId);
    RecipeIngredient.validateYield(props.yieldPercentOverride ?? null);

    const ri = new RecipeIngredient();
    ri.id = randomUUID();
    ri.recipeId = props.recipeId;
    ri.ingredientId = props.ingredientId;
    ri.subRecipeId = props.subRecipeId;
    ri.quantity = props.quantity;
    ri.unitId = props.unitId;
    ri.yieldPercentOverride = props.yieldPercentOverride ?? null;
    ri.sourceOverrideRef = props.sourceOverrideRef ?? null;
    return ri;
  }

  applyUpdate(
    patch: RecipeIngredientUpdateProps & {
      recipeId?: string;
      ingredientId?: string | null;
      subRecipeId?: string | null;
    },
  ): void {
    if ('recipeId' in patch && patch.recipeId !== undefined) {
      throw new Error('RecipeIngredient.recipeId is immutable; delete + recreate the line instead');
    }
    if ('ingredientId' in patch || 'subRecipeId' in patch) {
      throw new Error('RecipeIngredient.ingredientId / subRecipeId are immutable (composite identity); delete + recreate the line');
    }
    if (patch.quantity !== undefined) {
      RecipeIngredient.validatePositive('quantity', patch.quantity);
      this.quantity = patch.quantity;
    }
    if (patch.unitId !== undefined) {
      RecipeIngredient.validateUnit(patch.unitId);
      this.unitId = patch.unitId;
    }
    if (patch.yieldPercentOverride !== undefined) {
      RecipeIngredient.validateYield(patch.yieldPercentOverride);
      this.yieldPercentOverride = patch.yieldPercentOverride;
    }
    if (patch.sourceOverrideRef !== undefined) {
      this.sourceOverrideRef = patch.sourceOverrideRef;
    }
  }

  private static validateUuid(field: string, value: string): void {
    if (typeof value !== 'string' || !UUID_RX.test(value)) {
      throw new Error(`RecipeIngredient.${field} must be a UUID; got "${value}"`);
    }
  }

  private static validateComposite(ingredientId: string | null, subRecipeId: string | null): void {
    const hasIng = ingredientId !== null && ingredientId !== undefined;
    const hasSub = subRecipeId !== null && subRecipeId !== undefined;
    if (hasIng && hasSub) {
      throw new Error('RecipeIngredient: exactly one of ingredientId / subRecipeId must be set; both were provided');
    }
    if (!hasIng && !hasSub) {
      throw new Error('RecipeIngredient: exactly one of ingredientId / subRecipeId must be set; neither was provided');
    }
    if (hasIng) {
      RecipeIngredient.validateUuid('ingredientId', ingredientId!);
    } else {
      RecipeIngredient.validateUuid('subRecipeId', subRecipeId!);
    }
  }

  private static validatePositive(field: string, value: number): void {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`RecipeIngredient.${field} must be a positive finite number; got ${value}`);
    }
  }

  private static validateUnit(unitId: string): void {
    if (typeof unitId !== 'string' || unitId.trim().length === 0) {
      throw new Error('RecipeIngredient.unitId must be a non-empty UoM code');
    }
  }

  private static validateYield(y: number | null): void {
    if (y === null || y === undefined) return;
    if (!Number.isFinite(y) || y < 0 || y > 1) {
      throw new Error(`RecipeIngredient.yieldPercentOverride must be in [0, 1]; got ${y}`);
    }
  }
}
