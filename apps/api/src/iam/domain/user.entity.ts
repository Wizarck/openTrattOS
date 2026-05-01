import { randomUUID } from 'node:crypto';
import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export type UserRole = 'OWNER' | 'MANAGER' | 'STAFF';
const USER_ROLES: readonly UserRole[] = ['OWNER', 'MANAGER', 'STAFF'];

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Pragmatic email check (not RFC-perfect): one @, non-empty local & domain, domain has a dot.
const EMAIL_RX = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;
const BCRYPT_RX = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

export interface UserCreateProps {
  organizationId: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
}

export interface UserUpdateProps {
  name?: string;
  email?: string;
  role?: UserRole;
}

@Entity({ name: 'users' })
@Index('uq_users_org_email', ['organizationId', 'email'], { unique: true })
@Index('ix_users_organization_id', ['organizationId'])
export class User {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'varchar', length: 320 })
  email!: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 60 })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 16 })
  role!: UserRole;

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

  static create(props: UserCreateProps): User {
    User.validateUuid('organizationId', props.organizationId);
    User.validateName(props.name);
    User.validateRole(props.role);
    User.validatePasswordHash(props.passwordHash);
    const email = User.normaliseEmail(props.email);

    const user = new User();
    user.id = randomUUID();
    user.organizationId = props.organizationId;
    user.name = props.name.trim();
    user.email = email;
    user.passwordHash = props.passwordHash;
    user.role = props.role;
    user.isActive = true;
    return user;
  }

  applyUpdate(
    patch: UserUpdateProps & { organizationId?: string; passwordHash?: string },
  ): void {
    if ('organizationId' in patch && patch.organizationId !== undefined) {
      throw new Error('User.organizationId is immutable; reassigning a user across tenants is forbidden');
    }
    if ('passwordHash' in patch && patch.passwordHash !== undefined) {
      throw new Error('Use User.changePassword(hash) instead of applyUpdate to change passwordHash');
    }
    if (patch.name !== undefined) {
      User.validateName(patch.name);
      this.name = patch.name.trim();
    }
    if (patch.email !== undefined) {
      this.email = User.normaliseEmail(patch.email);
    }
    if (patch.role !== undefined) {
      User.validateRole(patch.role);
      this.role = patch.role;
    }
  }

  changePassword(newHash: string): void {
    User.validatePasswordHash(newHash);
    this.passwordHash = newHash;
  }

  activate(): void {
    this.isActive = true;
  }

  deactivate(): void {
    this.isActive = false;
  }

  private static validateUuid(field: string, value: string): void {
    if (typeof value !== 'string' || !UUID_RX.test(value)) {
      throw new Error(`User.${field} must be a UUID; got "${value}"`);
    }
  }

  private static validateName(name: string): void {
    if (typeof name !== 'string' || name.trim().length === 0) {
      throw new Error('User.name must be a non-empty string');
    }
  }

  private static validateRole(role: UserRole): void {
    if (!USER_ROLES.includes(role)) {
      throw new Error(`User.role must be one of ${USER_ROLES.join(', ')}; got "${role}"`);
    }
  }

  private static normaliseEmail(email: string): string {
    if (typeof email !== 'string' || !EMAIL_RX.test(email.trim())) {
      throw new Error(`User.email is not a valid email address; got "${email}"`);
    }
    return email.trim().toLowerCase();
  }

  private static validatePasswordHash(hash: string): void {
    if (typeof hash !== 'string' || !BCRYPT_RX.test(hash)) {
      throw new Error('User.passwordHash must be a bcrypt hash ($2a/$2b/$2y, cost 04-31, 53-char tail)');
    }
  }
}
