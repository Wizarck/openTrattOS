import { randomUUID } from 'node:crypto';
import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { Ingredient } from '../../ingredients/domain/ingredient.entity';
import { convert } from '../../ingredients/domain/uom/convert';
import { findUnit } from '../../ingredients/domain/uom/units';

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const FAMILY_BASE_UNIT: Record<'WEIGHT' | 'VOLUME' | 'UNIT', string> = {
  WEIGHT: 'g',
  VOLUME: 'ml',
  UNIT: 'pcs',
};

export interface SupplierItemCreateProps {
  supplierId: string;
  ingredientId: string;
  purchaseUnit: string;
  purchaseUnitQty: number;
  purchaseUnitType: string;
  unitPrice: number;
  isPreferred?: boolean;
}

export interface SupplierItemUpdateProps {
  purchaseUnit?: string;
  purchaseUnitQty?: number;
  purchaseUnitType?: string;
  unitPrice?: number;
}

@Entity({ name: 'supplier_items' })
@Index('ix_supplier_items_supplier_id', ['supplierId'])
@Index('ix_supplier_items_ingredient_id', ['ingredientId'])
export class SupplierItem {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'supplier_id', type: 'uuid' })
  supplierId!: string;

  @Column({ name: 'ingredient_id', type: 'uuid' })
  ingredientId!: string;

  @Column({ name: 'purchase_unit', type: 'varchar', length: 100 })
  purchaseUnit!: string;

  @Column({ name: 'purchase_unit_qty', type: 'double precision' })
  purchaseUnitQty!: number;

  @Column({ name: 'purchase_unit_type', type: 'varchar', length: 16 })
  purchaseUnitType!: string;

  @Column({ name: 'unit_price', type: 'numeric', precision: 14, scale: 4 })
  unitPrice!: number;

  @Column({ name: 'cost_per_base_unit', type: 'numeric', precision: 14, scale: 4, nullable: true })
  costPerBaseUnit: number | null = null;

  @Column({ name: 'is_preferred', type: 'boolean', default: false })
  isPreferred: boolean = false;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null = null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null = null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  static create(props: SupplierItemCreateProps): SupplierItem {
    SupplierItem.validateUuid('supplierId', props.supplierId);
    SupplierItem.validateUuid('ingredientId', props.ingredientId);
    SupplierItem.validateLabel(props.purchaseUnit);
    SupplierItem.validatePositive('purchaseUnitQty', props.purchaseUnitQty);
    SupplierItem.validatePositive('unitPrice', props.unitPrice);
    if (!findUnit(props.purchaseUnitType)) {
      throw new Error(`SupplierItem.purchaseUnitType is not a registered UoM code: "${props.purchaseUnitType}"`);
    }

    const si = new SupplierItem();
    si.id = randomUUID();
    si.supplierId = props.supplierId;
    si.ingredientId = props.ingredientId;
    si.purchaseUnit = props.purchaseUnit.trim();
    si.purchaseUnitQty = props.purchaseUnitQty;
    si.purchaseUnitType = props.purchaseUnitType;
    si.unitPrice = props.unitPrice;
    si.isPreferred = props.isPreferred ?? false;
    return si;
  }

  /**
   * Returns price per single base unit of the ingredient (€/g for WEIGHT,
   * €/ml for VOLUME, €/pcs for UNIT). Pure: depends only on the supplier
   * item's fields and the ingredient's baseUnitType. Rounded to 4 decimals
   * per D6 (cost storage precision).
   *
   * Throws if the supplier-item's purchaseUnitType family does not match
   * the ingredient's baseUnitType, or if the ingredient does not match the
   * `ingredientId` recorded on this supplier item.
   */
  computeCostPerBaseUnit(ingredient: Ingredient): number {
    if (ingredient.id !== this.ingredientId) {
      throw new Error(`SupplierItem.computeCostPerBaseUnit: ingredient ${ingredient.id} does not match supplier item ingredientId ${this.ingredientId}`);
    }
    const purchaseUnitDef = findUnit(this.purchaseUnitType);
    if (!purchaseUnitDef) {
      throw new Error(`SupplierItem.purchaseUnitType not registered: ${this.purchaseUnitType}`);
    }
    if (purchaseUnitDef.family !== ingredient.baseUnitType) {
      throw new Error(
        `SupplierItem family mismatch: purchaseUnitType "${this.purchaseUnitType}" is ${purchaseUnitDef.family} but ingredient baseUnitType is ${ingredient.baseUnitType}`,
      );
    }
    const baseUnit = FAMILY_BASE_UNIT[ingredient.baseUnitType];
    const qtyInBase = convert(this.purchaseUnitQty, this.purchaseUnitType, baseUnit);
    const cpbu = this.unitPrice / qtyInBase;
    return Math.round(cpbu * 10_000) / 10_000;
  }

  applyUpdate(
    patch: SupplierItemUpdateProps & { supplierId?: string; ingredientId?: string },
  ): void {
    if ('supplierId' in patch && patch.supplierId !== undefined) {
      throw new Error('SupplierItem.supplierId is immutable; create a new SupplierItem instead');
    }
    if ('ingredientId' in patch && patch.ingredientId !== undefined) {
      throw new Error('SupplierItem.ingredientId is immutable; create a new SupplierItem instead');
    }
    if (patch.purchaseUnit !== undefined) {
      SupplierItem.validateLabel(patch.purchaseUnit);
      this.purchaseUnit = patch.purchaseUnit.trim();
    }
    if (patch.purchaseUnitQty !== undefined) {
      SupplierItem.validatePositive('purchaseUnitQty', patch.purchaseUnitQty);
      this.purchaseUnitQty = patch.purchaseUnitQty;
    }
    if (patch.purchaseUnitType !== undefined) {
      if (!findUnit(patch.purchaseUnitType)) {
        throw new Error(`SupplierItem.purchaseUnitType not registered: "${patch.purchaseUnitType}"`);
      }
      this.purchaseUnitType = patch.purchaseUnitType;
    }
    if (patch.unitPrice !== undefined) {
      SupplierItem.validatePositive('unitPrice', patch.unitPrice);
      this.unitPrice = patch.unitPrice;
    }
  }

  setPreferred(value: boolean): void {
    this.isPreferred = value;
  }

  private static validateUuid(field: string, value: string): void {
    if (typeof value !== 'string' || !UUID_RX.test(value)) {
      throw new Error(`SupplierItem.${field} must be a UUID; got "${value}"`);
    }
  }

  private static validateLabel(label: string): void {
    if (typeof label !== 'string' || label.trim().length === 0) {
      throw new Error('SupplierItem.purchaseUnit must be a non-empty display label');
    }
  }

  private static validatePositive(field: string, value: number): void {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`SupplierItem.${field} must be a positive finite number; got ${value}`);
    }
  }
}
