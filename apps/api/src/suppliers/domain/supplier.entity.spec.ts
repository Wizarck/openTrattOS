import { Supplier, SupplierCreateProps } from './supplier.entity';

const orgId = '11111111-1111-4111-8111-111111111111';
const validProps = (overrides: Partial<SupplierCreateProps> = {}): SupplierCreateProps => ({
  organizationId: orgId,
  name: 'Distribuidora Levante S.L.',
  country: 'ES',
  ...overrides,
});

describe('Supplier.create', () => {
  it('returns a Supplier with UUID id, isActive=true, optional contact null', () => {
    const s = Supplier.create(validProps());
    expect(s.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(s.organizationId).toBe(orgId);
    expect(s.name).toBe('Distribuidora Levante S.L.');
    expect(s.country).toBe('ES');
    expect(s.contactName).toBeNull();
    expect(s.email).toBeNull();
    expect(s.phone).toBeNull();
    expect(s.isActive).toBe(true);
  });

  it('accepts optional contact fields', () => {
    const s = Supplier.create(
      validProps({ contactName: 'Maria', email: 'maria@levante.example', phone: '+34600111222' }),
    );
    expect(s.contactName).toBe('Maria');
    expect(s.email).toBe('maria@levante.example');
    expect(s.phone).toBe('+34600111222');
  });

  it('rejects empty name', () => {
    expect(() => Supplier.create(validProps({ name: '' }))).toThrow(/name/i);
  });

  it.each(['ES', 'FR', 'IT', 'PT', 'DE', 'GB'])('accepts ISO 3166 alpha-2 country %s', (c) => {
    expect(() => Supplier.create(validProps({ country: c }))).not.toThrow();
  });

  it.each(['es', 'spain', 'ESP', 'E', '12'])('rejects invalid country "%s"', (c) => {
    expect(() => Supplier.create(validProps({ country: c }))).toThrow(/country/i);
  });

  it.each(['notanemail', '@x.com', 'a@', 'a@b'])('rejects malformed email "%s"', (e) => {
    expect(() => Supplier.create(validProps({ email: e }))).toThrow(/email/i);
  });

  it('rejects non-uuid organizationId', () => {
    expect(() => Supplier.create(validProps({ organizationId: 'nope' }))).toThrow(/organizationId|uuid/i);
  });
});

describe('Supplier.applyUpdate', () => {
  it('updates mutable fields', () => {
    const s = Supplier.create(validProps());
    s.applyUpdate({ name: 'New name', contactName: 'Jose', email: 'jose@x.com', phone: '+1', country: 'FR' });
    expect(s.name).toBe('New name');
    expect(s.contactName).toBe('Jose');
    expect(s.email).toBe('jose@x.com');
    expect(s.phone).toBe('+1');
    expect(s.country).toBe('FR');
  });

  it('refuses to change organizationId', () => {
    const s = Supplier.create(validProps());
    expect(() =>
      s.applyUpdate({
        organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      } as Parameters<typeof s.applyUpdate>[0]),
    ).toThrow(/organizationId|tenant/i);
  });
});

describe('Supplier activate/deactivate', () => {
  it('toggles isActive', () => {
    const s = Supplier.create(validProps());
    s.deactivate();
    expect(s.isActive).toBe(false);
    s.activate();
    expect(s.isActive).toBe(true);
  });
});
