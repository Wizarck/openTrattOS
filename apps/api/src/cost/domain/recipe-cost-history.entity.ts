import { randomUUID } from 'node:crypto';
import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CostChangeReason =
  | 'INITIAL'
  | 'SUPPLIER_PRICE_CHANGE'
  | 'LINE_EDIT'
  | 'SUB_RECIPE_CHANGE'
  | 'SOURCE_OVERRIDE'
  | 'MANUAL_RECOMPUTE';

export interface RecipeCostHistoryCreateProps {
  recipeId: string;
  organizationId: string;
  /** RecipeIngredient.id when the row tracks a specific component; null for top-level totals. */
  componentRefId: string | null;
  /** Cost per single base unit at the moment of capture (€/g, €/ml, €/pcs). */
  costPerBaseUnit: number;
  /** Aggregated recipe total cost at the moment of capture. */
  totalCost: number;
  /** SupplierItem.id (M2) or Batch.id (M3) that drove the cost; null when no source resolved. */
  sourceRefId: string | null;
  reason: CostChangeReason;
}

@Entity({ name: 'recipe_cost_history' })
@Index('ix_recipe_cost_history_recipe_computed', ['recipeId', 'computedAt'])
@Index('ix_recipe_cost_history_organization', ['organizationId'])
export class RecipeCostHistory {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'recipe_id', type: 'uuid' })
  recipeId!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'component_ref_id', type: 'uuid', nullable: true })
  componentRefId: string | null = null;

  @Column({ name: 'cost_per_base_unit', type: 'numeric', precision: 14, scale: 4 })
  costPerBaseUnit!: number;

  @Column({ name: 'total_cost', type: 'numeric', precision: 14, scale: 4 })
  totalCost!: number;

  @Column({ name: 'source_ref_id', type: 'uuid', nullable: true })
  sourceRefId: string | null = null;

  @Column({ type: 'varchar', length: 32 })
  reason!: CostChangeReason;

  @CreateDateColumn({ name: 'computed_at', type: 'timestamptz' })
  computedAt!: Date;

  static create(props: RecipeCostHistoryCreateProps): RecipeCostHistory {
    RecipeCostHistory.validateUuid('recipeId', props.recipeId);
    RecipeCostHistory.validateUuid('organizationId', props.organizationId);
    if (props.componentRefId !== null) {
      RecipeCostHistory.validateUuid('componentRefId', props.componentRefId);
    }
    if (props.sourceRefId !== null) {
      RecipeCostHistory.validateUuid('sourceRefId', props.sourceRefId);
    }
    if (!Number.isFinite(props.costPerBaseUnit) || props.costPerBaseUnit < 0) {
      throw new Error(
        `RecipeCostHistory.costPerBaseUnit must be a non-negative finite number; got ${props.costPerBaseUnit}`,
      );
    }
    if (!Number.isFinite(props.totalCost) || props.totalCost < 0) {
      throw new Error(
        `RecipeCostHistory.totalCost must be a non-negative finite number; got ${props.totalCost}`,
      );
    }

    const h = new RecipeCostHistory();
    h.id = randomUUID();
    h.recipeId = props.recipeId;
    h.organizationId = props.organizationId;
    h.componentRefId = props.componentRefId;
    h.costPerBaseUnit = props.costPerBaseUnit;
    h.totalCost = props.totalCost;
    h.sourceRefId = props.sourceRefId;
    h.reason = props.reason;
    return h;
  }

  private static validateUuid(field: string, value: string): void {
    if (typeof value !== 'string' || !UUID_RX.test(value)) {
      throw new Error(`RecipeCostHistory.${field} must be a UUID; got "${value}"`);
    }
  }
}
