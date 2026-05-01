import { randomUUID } from 'node:crypto';
import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export type LocationType =
  | 'RESTAURANT'
  | 'BAR'
  | 'DARK_KITCHEN'
  | 'CATERING'
  | 'CENTRAL_PRODUCTION';
const LOCATION_TYPES: readonly LocationType[] = [
  'RESTAURANT',
  'BAR',
  'DARK_KITCHEN',
  'CATERING',
  'CENTRAL_PRODUCTION',
];

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface LocationCreateProps {
  organizationId: string;
  name: string;
  address: string;
  type: LocationType;
}

export interface LocationUpdateProps {
  name?: string;
  address?: string;
  type?: LocationType;
}

@Entity({ name: 'locations' })
@Index('ix_locations_organization_id', ['organizationId'])
export class Location {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'varchar', length: 500, default: '' })
  address: string = '';

  @Column({ type: 'varchar', length: 32 })
  type!: LocationType;

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

  static create(props: LocationCreateProps): Location {
    Location.validateUuid('organizationId', props.organizationId);
    Location.validateName(props.name);
    Location.validateType(props.type);

    const loc = new Location();
    loc.id = randomUUID();
    loc.organizationId = props.organizationId;
    loc.name = props.name.trim();
    loc.address = props.address ?? '';
    loc.type = props.type;
    loc.isActive = true;
    return loc;
  }

  applyUpdate(patch: LocationUpdateProps & { organizationId?: string }): void {
    if ('organizationId' in patch && patch.organizationId !== undefined) {
      throw new Error('Location.organizationId is immutable; cannot reassign across tenants');
    }
    if (patch.name !== undefined) {
      Location.validateName(patch.name);
      this.name = patch.name.trim();
    }
    if (patch.address !== undefined) {
      this.address = patch.address;
    }
    if (patch.type !== undefined) {
      Location.validateType(patch.type);
      this.type = patch.type;
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
      throw new Error(`Location.${field} must be a UUID; got "${value}"`);
    }
  }

  private static validateName(name: string): void {
    if (typeof name !== 'string' || name.trim().length === 0) {
      throw new Error('Location.name must be a non-empty string');
    }
  }

  private static validateType(type: LocationType): void {
    if (!LOCATION_TYPES.includes(type)) {
      throw new Error(`Location.type must be one of ${LOCATION_TYPES.join(', ')}; got "${type}"`);
    }
  }
}
