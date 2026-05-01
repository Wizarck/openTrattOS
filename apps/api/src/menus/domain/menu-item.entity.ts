import { randomUUID } from 'node:crypto';
import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export type MenuItemChannel = 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY' | 'CATERING';
const MENU_ITEM_CHANNELS: readonly MenuItemChannel[] = ['DINE_IN', 'TAKEAWAY', 'DELIVERY', 'CATERING'];

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface MenuItemCreateProps {
  organizationId: string;
  recipeId: string;
  locationId: string;
  channel: MenuItemChannel;
  sellingPrice: number;
  targetMargin: number;
}

export interface MenuItemUpdateProps {
  channel?: MenuItemChannel;
  sellingPrice?: number;
  targetMargin?: number;
}

@Entity({ name: 'menu_items' })
@Index('ix_menu_items_organization_id', ['organizationId'])
@Index('ix_menu_items_recipe_id', ['recipeId'])
@Index('ix_menu_items_organization_location', ['organizationId', 'locationId'])
export class MenuItem {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'recipe_id', type: 'uuid' })
  recipeId!: string;

  @Column({ name: 'location_id', type: 'uuid' })
  locationId!: string;

  @Column({ type: 'varchar', length: 16 })
  channel!: MenuItemChannel;

  @Column({ name: 'selling_price', type: 'numeric', precision: 14, scale: 4 })
  sellingPrice!: number;

  @Column({ name: 'target_margin', type: 'numeric', precision: 5, scale: 4 })
  targetMargin!: number;

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

  static create(props: MenuItemCreateProps): MenuItem {
    MenuItem.validateUuid('organizationId', props.organizationId);
    MenuItem.validateUuid('recipeId', props.recipeId);
    MenuItem.validateUuid('locationId', props.locationId);
    MenuItem.validateChannel(props.channel);
    MenuItem.validatePositive('sellingPrice', props.sellingPrice);
    MenuItem.validateMargin(props.targetMargin);

    const m = new MenuItem();
    m.id = randomUUID();
    m.organizationId = props.organizationId;
    m.recipeId = props.recipeId;
    m.locationId = props.locationId;
    m.channel = props.channel;
    m.sellingPrice = props.sellingPrice;
    m.targetMargin = props.targetMargin;
    m.isActive = true;
    return m;
  }

  applyUpdate(
    patch: MenuItemUpdateProps & { organizationId?: string; recipeId?: string; locationId?: string },
  ): void {
    if ('organizationId' in patch && patch.organizationId !== undefined) {
      throw new Error('MenuItem.organizationId is immutable; cannot reassign across tenants');
    }
    if ('recipeId' in patch && patch.recipeId !== undefined) {
      throw new Error('MenuItem.recipeId is immutable; create a new MenuItem for a different Recipe');
    }
    if ('locationId' in patch && patch.locationId !== undefined) {
      throw new Error('MenuItem.locationId is immutable; create a new MenuItem for a different Location');
    }
    if (patch.channel !== undefined) {
      MenuItem.validateChannel(patch.channel);
      this.channel = patch.channel;
    }
    if (patch.sellingPrice !== undefined) {
      MenuItem.validatePositive('sellingPrice', patch.sellingPrice);
      this.sellingPrice = patch.sellingPrice;
    }
    if (patch.targetMargin !== undefined) {
      MenuItem.validateMargin(patch.targetMargin);
      this.targetMargin = patch.targetMargin;
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
      throw new Error(`MenuItem.${field} must be a UUID; got "${value}"`);
    }
  }

  private static validateChannel(c: MenuItemChannel): void {
    if (!MENU_ITEM_CHANNELS.includes(c)) {
      throw new Error(`MenuItem.channel must be one of ${MENU_ITEM_CHANNELS.join(', ')}; got "${c}"`);
    }
  }

  private static validatePositive(field: string, value: number): void {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`MenuItem.${field} must be a positive finite number; got ${value}`);
    }
  }

  private static validateMargin(m: number): void {
    if (!Number.isFinite(m) || m < 0 || m >= 1) {
      throw new Error(`MenuItem.targetMargin must be in [0, 1); got ${m}`);
    }
  }
}
