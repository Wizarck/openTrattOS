import { randomUUID } from 'node:crypto';
import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COUNTRY_RX = /^[A-Z]{2}$/;
const EMAIL_RX = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;

export interface SupplierCreateProps {
  organizationId: string;
  name: string;
  country: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface SupplierUpdateProps {
  name?: string;
  country?: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
}

@Entity({ name: 'suppliers' })
@Index('ix_suppliers_organization_id', ['organizationId'])
export class Supplier {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ name: 'contact_name', type: 'varchar', length: 200, nullable: true })
  contactName: string | null = null;

  @Column({ type: 'varchar', length: 320, nullable: true })
  email: string | null = null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  phone: string | null = null;

  @Column({ type: 'char', length: 2 })
  country!: string;

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

  static create(props: SupplierCreateProps): Supplier {
    Supplier.validateUuid('organizationId', props.organizationId);
    Supplier.validateName(props.name);
    Supplier.validateCountry(props.country);
    if (props.email !== undefined && props.email !== null) {
      Supplier.validateEmail(props.email);
    }

    const s = new Supplier();
    s.id = randomUUID();
    s.organizationId = props.organizationId;
    s.name = props.name.trim();
    s.country = props.country;
    s.contactName = props.contactName ?? null;
    s.email = props.email ? props.email.trim().toLowerCase() : null;
    s.phone = props.phone ?? null;
    s.isActive = true;
    return s;
  }

  applyUpdate(patch: SupplierUpdateProps & { organizationId?: string }): void {
    if ('organizationId' in patch && patch.organizationId !== undefined) {
      throw new Error('Supplier.organizationId is immutable; cannot reassign across tenants');
    }
    if (patch.name !== undefined) {
      Supplier.validateName(patch.name);
      this.name = patch.name.trim();
    }
    if (patch.country !== undefined) {
      Supplier.validateCountry(patch.country);
      this.country = patch.country;
    }
    if (patch.contactName !== undefined) {
      this.contactName = patch.contactName;
    }
    if (patch.email !== undefined) {
      if (patch.email !== null) {
        Supplier.validateEmail(patch.email);
        this.email = patch.email.trim().toLowerCase();
      } else {
        this.email = null;
      }
    }
    if (patch.phone !== undefined) {
      this.phone = patch.phone;
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
      throw new Error(`Supplier.${field} must be a UUID; got "${value}"`);
    }
  }

  private static validateName(name: string): void {
    if (typeof name !== 'string' || name.trim().length === 0) {
      throw new Error('Supplier.name must be a non-empty string');
    }
  }

  private static validateCountry(c: string): void {
    if (!COUNTRY_RX.test(c)) {
      throw new Error(`Supplier.country must be ISO 3166-1 alpha-2 (2 uppercase letters); got "${c}"`);
    }
  }

  private static validateEmail(e: string): void {
    if (!EMAIL_RX.test(e.trim())) {
      throw new Error(`Supplier.email is not a valid email address; got "${e}"`);
    }
  }
}
