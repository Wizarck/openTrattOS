import { randomUUID } from 'node:crypto';
import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

const ISO_4217 = /^[A-Z]{3}$/;
const LOCALE_LOWER_2 = /^[a-z]{2}$/;

export interface OrganizationCreateProps {
  name: string;
  currencyCode: string;
  defaultLocale: string;
  timezone: string;
}

export interface OrganizationUpdateProps {
  name?: string;
  defaultLocale?: string;
  timezone?: string;
}

@Entity({ name: 'organizations' })
@Index('ix_organizations_name', ['name'])
export class Organization {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ name: 'currency_code', type: 'char', length: 3 })
  currencyCode!: string;

  @Column({ name: 'default_locale', type: 'varchar', length: 8 })
  defaultLocale!: string;

  @Column({ type: 'varchar', length: 64 })
  timezone!: string;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null = null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null = null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  static create(props: OrganizationCreateProps): Organization {
    Organization.validateName(props.name);
    Organization.validateCurrency(props.currencyCode);
    Organization.validateLocale(props.defaultLocale);
    Organization.validateTimezone(props.timezone);

    const org = new Organization();
    org.id = randomUUID();
    org.name = props.name.trim();
    org.currencyCode = props.currencyCode;
    org.defaultLocale = props.defaultLocale;
    org.timezone = props.timezone;
    Organization.lockCurrency(org);
    return org;
  }

  applyUpdate(patch: OrganizationUpdateProps & { currencyCode?: string }): void {
    if ('currencyCode' in patch && patch.currencyCode !== undefined) {
      throw new Error('Organization.currencyCode is immutable; cannot change currency post-creation (ADR-007)');
    }
    if (patch.name !== undefined) {
      Organization.validateName(patch.name);
      this.name = patch.name.trim();
    }
    if (patch.defaultLocale !== undefined) {
      Organization.validateLocale(patch.defaultLocale);
      this.defaultLocale = patch.defaultLocale;
    }
    if (patch.timezone !== undefined) {
      Organization.validateTimezone(patch.timezone);
      this.timezone = patch.timezone;
    }
  }

  private static validateName(name: string): void {
    if (typeof name !== 'string' || name.trim().length === 0) {
      throw new Error('Organization.name must be a non-empty string');
    }
  }

  private static validateCurrency(code: string): void {
    if (!ISO_4217.test(code)) {
      throw new Error(`Organization.currencyCode must match ISO 4217 (3 uppercase letters); got "${code}"`);
    }
  }

  private static validateLocale(locale: string): void {
    if (!LOCALE_LOWER_2.test(locale)) {
      throw new Error(`Organization.defaultLocale must be a 2-letter lowercase ISO 639-1 code; got "${locale}"`);
    }
  }

  private static validateTimezone(tz: string): void {
    if (typeof tz !== 'string' || tz.trim().length === 0) {
      throw new Error('Organization.timezone must be a non-empty string (IANA timezone identifier)');
    }
  }

  private static lockCurrency(org: Organization): void {
    Object.defineProperty(org, 'currencyCode', {
      value: org.currencyCode,
      writable: false,
      configurable: false,
      enumerable: true,
    });
  }
}
