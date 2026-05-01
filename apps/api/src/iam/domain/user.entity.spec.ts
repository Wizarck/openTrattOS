import { User, UserCreateProps, UserRole } from './user.entity';

const orgId = '11111111-1111-4111-8111-111111111111';
const validProps = (overrides: Partial<UserCreateProps> = {}): UserCreateProps => ({
  organizationId: orgId,
  name: 'Lourdes García',
  email: 'lourdes@acme.example',
  passwordHash: '$2b$12$KIXMHnFdTsHHBMmEJYRzKePQGyDOuxF7vSj.O5kmaYxLHJyxeBoAi',
  role: 'MANAGER',
  ...overrides,
});

describe('User.create', () => {
  it('returns a User with a UUID id and the given props', () => {
    const user = User.create(validProps());
    expect(user.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(user.organizationId).toBe(orgId);
    expect(user.name).toBe('Lourdes García');
    expect(user.email).toBe('lourdes@acme.example');
    expect(user.role).toBe('MANAGER');
    expect(user.isActive).toBe(true);
  });

  it('lowercases the email before storing it', () => {
    const user = User.create(validProps({ email: 'LourDes@ACME.example' }));
    expect(user.email).toBe('lourdes@acme.example');
  });

  it('rejects empty name', () => {
    expect(() => User.create(validProps({ name: '' }))).toThrow(/name/i);
  });

  describe('role enum (OWNER | MANAGER | STAFF)', () => {
    it.each<UserRole>(['OWNER', 'MANAGER', 'STAFF'])('accepts %s', (role) => {
      expect(() => User.create(validProps({ role }))).not.toThrow();
    });

    it.each(['ADMIN', 'manager', 'owner', 'staff', '', 'GUEST'])('rejects "%s"', (role) => {
      expect(() => User.create(validProps({ role: role as UserRole }))).toThrow(/role/i);
    });
  });

  describe('email format validation', () => {
    it.each([
      'a@b.co',
      'name.surname@example.com',
      'name+tag@sub.example.io',
      'üser@example.com',
    ])('accepts %s', (email) => {
      expect(() => User.create(validProps({ email }))).not.toThrow();
    });

    it.each(['', '   ', 'noatsign.com', '@no-local.com', 'missing@.com', 'no-tld@example', 'spaces in@example.com'])(
      'rejects "%s"',
      (email) => {
        expect(() => User.create(validProps({ email }))).toThrow(/email/i);
      },
    );
  });

  describe('passwordHash contract (bcrypt-shaped)', () => {
    it.each([
      '$2a$12$KIXMHnFdTsHHBMmEJYRzKePQGyDOuxF7vSj.O5kmaYxLHJyxeBoAi',
      '$2b$10$KIXMHnFdTsHHBMmEJYRzKePQGyDOuxF7vSj.O5kmaYxLHJyxeBoAi',
      '$2y$12$KIXMHnFdTsHHBMmEJYRzKePQGyDOuxF7vSj.O5kmaYxLHJyxeBoAi',
    ])('accepts %s', (hash) => {
      expect(() => User.create(validProps({ passwordHash: hash }))).not.toThrow();
    });

    it.each([
      'plaintext',
      '$1$abc',
      '$2c$12$too-short',
      'md5:abcdef',
      '',
    ])('rejects non-bcrypt hash "%s"', (hash) => {
      expect(() => User.create(validProps({ passwordHash: hash }))).toThrow(/passwordHash|bcrypt/i);
    });
  });

  describe('organizationId', () => {
    it('rejects non-uuid value', () => {
      expect(() => User.create(validProps({ organizationId: 'not-a-uuid' }))).toThrow(/organizationId|uuid/i);
    });
  });
});

describe('User.deactivate / User.activate', () => {
  it('toggles isActive without other side-effects', () => {
    const user = User.create(validProps());
    expect(user.isActive).toBe(true);
    user.deactivate();
    expect(user.isActive).toBe(false);
    user.activate();
    expect(user.isActive).toBe(true);
  });
});

describe('User.applyUpdate', () => {
  it('updates mutable fields (name, role, email)', () => {
    const user = User.create(validProps());
    user.applyUpdate({ name: 'Lourdes G.', role: 'OWNER', email: 'L@example.com' });
    expect(user.name).toBe('Lourdes G.');
    expect(user.role).toBe('OWNER');
    expect(user.email).toBe('l@example.com');
  });

  it('refuses to change organizationId (multi-tenant invariant)', () => {
    const user = User.create(validProps());
    expect(() =>
      user.applyUpdate({ organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } as Parameters<typeof user.applyUpdate>[0]),
    ).toThrow(/organizationId|tenant/i);
  });

  it('does NOT directly accept passwordHash (use changePassword)', () => {
    const user = User.create(validProps());
    expect(() =>
      user.applyUpdate({ passwordHash: 'whatever' } as Parameters<typeof user.applyUpdate>[0]),
    ).toThrow(/passwordHash|changePassword/i);
  });
});

describe('User.changePassword', () => {
  it('replaces the hash when given a valid new bcrypt hash', () => {
    const user = User.create(validProps());
    const newHash = '$2b$12$NEWHASHabcdefghijklmnopqrstuv0123456789ABCDEFGHIJKLmn';
    user.changePassword(newHash);
    expect(user.passwordHash).toBe(newHash);
  });

  it('rejects an invalid hash', () => {
    const user = User.create(validProps());
    expect(() => user.changePassword('plaintext')).toThrow(/passwordHash|bcrypt/i);
  });
});
