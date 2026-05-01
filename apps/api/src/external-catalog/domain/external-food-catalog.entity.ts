import { randomUUID } from 'node:crypto';
import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Open-ended jsonb shape: persists the OFF nutriments payload as-is so OFF
 * schema evolution does not force a migration (per design.md §Risks).
 */
export type OffNutritionPayload = Record<string, unknown>;

export interface ExternalFoodCatalogCreateProps {
  barcode: string;
  name: string;
  brand: string | null;
  nutrition: OffNutritionPayload | null;
  allergens: string[];
  dietFlags: string[];
  region: string;
  lastModifiedAt: Date | null;
  licenseAttribution: string;
}

export interface ExternalFoodCatalogUpdateProps {
  name?: string;
  brand?: string | null;
  nutrition?: OffNutritionPayload | null;
  allergens?: string[];
  dietFlags?: string[];
  lastModifiedAt?: Date | null;
  licenseAttribution?: string;
}

/**
 * Mirror row of an Open Food Facts product subset relevant for restaurant
 * ingredients. Org-AGNOSTIC: the table is a SHARED region-scoped cache, not
 * tenant-partitioned (per design.md and m2-off-mirror.spec).
 *
 * No full audit fields: this row is sourced externally from OFF, so
 * `syncedAt` replaces created_by / updated_by per design.md §"What ships".
 */
@Entity({ name: 'external_food_catalog' })
@Index('uq_external_food_catalog_barcode', ['barcode'], { unique: true })
@Index('ix_external_food_catalog_region_last_modified', ['region', 'lastModifiedAt'])
export class ExternalFoodCatalog {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ type: 'varchar', length: 32 })
  barcode!: string;

  @Column({ type: 'varchar', length: 300 })
  name!: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  brand: string | null = null;

  @Column({ type: 'jsonb', nullable: true })
  nutrition: OffNutritionPayload | null = null;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  allergens!: string[];

  @Column({ name: 'diet_flags', type: 'text', array: true, default: () => "'{}'" })
  dietFlags!: string[];

  @Column({ type: 'varchar', length: 8 })
  region!: string;

  @Column({ name: 'last_modified_at', type: 'timestamptz', nullable: true })
  lastModifiedAt: Date | null = null;

  @Column({ name: 'license_attribution', type: 'text' })
  licenseAttribution!: string;

  @Column({ name: 'synced_at', type: 'timestamptz', default: () => 'now()' })
  syncedAt!: Date;

  static create(props: ExternalFoodCatalogCreateProps): ExternalFoodCatalog {
    ExternalFoodCatalog.validateBarcode(props.barcode);
    ExternalFoodCatalog.validateName(props.name);
    ExternalFoodCatalog.validateRegion(props.region);
    ExternalFoodCatalog.validateLicense(props.licenseAttribution);

    const row = new ExternalFoodCatalog();
    row.id = randomUUID();
    row.barcode = props.barcode.trim();
    row.name = props.name.trim();
    row.brand = ExternalFoodCatalog.normalizeBrand(props.brand);
    row.nutrition = props.nutrition;
    row.allergens = [...props.allergens];
    row.dietFlags = [...props.dietFlags];
    row.region = props.region.trim();
    row.lastModifiedAt = props.lastModifiedAt;
    row.licenseAttribution = props.licenseAttribution.trim();
    row.syncedAt = new Date();
    return row;
  }

  /**
   * Mutate fields refreshed from a subsequent OFF sync. `barcode` and `region`
   * are the stable identity keys and never change post-creation; the row would
   * be a different product otherwise.
   */
  applyUpdate(patch: ExternalFoodCatalogUpdateProps & { barcode?: string; region?: string }): void {
    if ('barcode' in patch && patch.barcode !== undefined) {
      throw new Error('ExternalFoodCatalog.barcode is immutable; create a new row for a different product');
    }
    if ('region' in patch && patch.region !== undefined) {
      throw new Error('ExternalFoodCatalog.region is immutable; the row identity is (barcode, region)');
    }
    if (patch.name !== undefined) {
      ExternalFoodCatalog.validateName(patch.name);
      this.name = patch.name.trim();
    }
    if (patch.brand !== undefined) {
      this.brand = ExternalFoodCatalog.normalizeBrand(patch.brand);
    }
    if (patch.nutrition !== undefined) {
      this.nutrition = patch.nutrition;
    }
    if (patch.allergens !== undefined) {
      this.allergens = [...patch.allergens];
    }
    if (patch.dietFlags !== undefined) {
      this.dietFlags = [...patch.dietFlags];
    }
    if (patch.lastModifiedAt !== undefined) {
      this.lastModifiedAt = patch.lastModifiedAt;
    }
    if (patch.licenseAttribution !== undefined) {
      ExternalFoodCatalog.validateLicense(patch.licenseAttribution);
      this.licenseAttribution = patch.licenseAttribution.trim();
    }
    this.syncedAt = new Date();
  }

  private static validateBarcode(b: string): void {
    if (typeof b !== 'string' || b.trim().length === 0) {
      throw new Error('ExternalFoodCatalog.barcode must be a non-empty string');
    }
  }

  private static validateName(n: string): void {
    if (typeof n !== 'string' || n.trim().length === 0) {
      throw new Error('ExternalFoodCatalog.name must be a non-empty string');
    }
  }

  private static validateRegion(r: string): void {
    if (typeof r !== 'string' || r.trim().length === 0) {
      throw new Error('ExternalFoodCatalog.region must be a non-empty string (e.g. "ES", "IT")');
    }
  }

  private static validateLicense(l: string): void {
    if (typeof l !== 'string' || l.trim().length === 0) {
      throw new Error(
        'ExternalFoodCatalog.licenseAttribution must be a non-empty string (ODbL compliance, ADR-015)',
      );
    }
  }

  private static normalizeBrand(b: string | null): string | null {
    if (b === null || b === undefined) return null;
    const trimmed = b.trim();
    return trimmed.length === 0 ? null : trimmed;
  }
}
