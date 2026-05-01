import { Location, LocationCreateProps, LocationType } from './location.entity';

const orgId = '11111111-1111-4111-8111-111111111111';
const validProps = (overrides: Partial<LocationCreateProps> = {}): LocationCreateProps => ({
  organizationId: orgId,
  name: 'Acme Madrid Centro',
  address: 'Calle Mayor 1, 28013 Madrid',
  type: 'RESTAURANT',
  ...overrides,
});

describe('Location.create', () => {
  it('returns a Location with a UUID id, the given props, and isActive=true', () => {
    const loc = Location.create(validProps());
    expect(loc.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(loc.organizationId).toBe(orgId);
    expect(loc.name).toBe('Acme Madrid Centro');
    expect(loc.address).toBe('Calle Mayor 1, 28013 Madrid');
    expect(loc.type).toBe('RESTAURANT');
    expect(loc.isActive).toBe(true);
  });

  it('rejects empty name', () => {
    expect(() => Location.create(validProps({ name: '' }))).toThrow(/name/i);
  });

  it('accepts an empty address (optional)', () => {
    expect(() => Location.create(validProps({ address: '' }))).not.toThrow();
  });

  describe('type enum', () => {
    it.each<LocationType>(['RESTAURANT', 'BAR', 'DARK_KITCHEN', 'CATERING', 'CENTRAL_PRODUCTION'])(
      'accepts %s',
      (type) => {
        expect(() => Location.create(validProps({ type }))).not.toThrow();
      },
    );

    it.each(['restaurant', 'KITCHEN', 'CAFE', '', 'OFFICE'])('rejects "%s"', (type) => {
      expect(() => Location.create(validProps({ type: type as LocationType }))).toThrow(/type/i);
    });
  });

  it('rejects non-uuid organizationId', () => {
    expect(() => Location.create(validProps({ organizationId: 'not-a-uuid' }))).toThrow(/organizationId|uuid/i);
  });
});

describe('Location.applyUpdate', () => {
  it('updates mutable fields (name, address, type)', () => {
    const loc = Location.create(validProps());
    loc.applyUpdate({ name: 'Acme Renamed', address: 'New address', type: 'BAR' });
    expect(loc.name).toBe('Acme Renamed');
    expect(loc.address).toBe('New address');
    expect(loc.type).toBe('BAR');
  });

  it('refuses to change organizationId (multi-tenant invariant)', () => {
    const loc = Location.create(validProps());
    expect(() =>
      loc.applyUpdate({
        organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      } as Parameters<typeof loc.applyUpdate>[0]),
    ).toThrow(/organizationId|tenant/i);
  });
});

describe('Location.activate / Location.deactivate', () => {
  it('toggles isActive', () => {
    const loc = Location.create(validProps());
    expect(loc.isActive).toBe(true);
    loc.deactivate();
    expect(loc.isActive).toBe(false);
    loc.activate();
    expect(loc.isActive).toBe(true);
  });
});
