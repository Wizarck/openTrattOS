import { MenuItem, MenuItemCreateProps } from './menu-item.entity';

const orgId = '11111111-1111-4111-8111-111111111111';
const recipeId = '22222222-2222-4222-8222-222222222222';
const locationId = '33333333-3333-4333-8333-333333333333';

const validProps = (overrides: Partial<MenuItemCreateProps> = {}): MenuItemCreateProps => ({
  organizationId: orgId,
  recipeId,
  locationId,
  channel: 'DINE_IN',
  sellingPrice: 14.5,
  targetMargin: 0.65,
  ...overrides,
});

describe('MenuItem.create', () => {
  it('returns a MenuItem with UUID id, props applied, isActive=true', () => {
    const m = MenuItem.create(validProps());
    expect(m.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(m.organizationId).toBe(orgId);
    expect(m.recipeId).toBe(recipeId);
    expect(m.locationId).toBe(locationId);
    expect(m.channel).toBe('DINE_IN');
    expect(m.sellingPrice).toBe(14.5);
    expect(m.targetMargin).toBe(0.65);
    expect(m.isActive).toBe(true);
  });

  it.each(['DINE_IN', 'TAKEAWAY', 'DELIVERY', 'CATERING'])('accepts channel %s', (c) => {
    expect(() => MenuItem.create(validProps({ channel: c as MenuItemCreateProps['channel'] }))).not.toThrow();
  });

  it.each(['', 'lowercase', 'XYZ', 'OTHER'])('rejects invalid channel "%s"', (c) => {
    expect(() => MenuItem.create(validProps({ channel: c as MenuItemCreateProps['channel'] }))).toThrow(/channel/i);
  });

  it.each([0, -1, NaN, Infinity])('rejects non-positive sellingPrice %s', (p) => {
    expect(() => MenuItem.create(validProps({ sellingPrice: p as number }))).toThrow(/sellingPrice/i);
  });

  it.each([0, 0.5, 0.99])('accepts targetMargin in [0, 1) %s', (m) => {
    expect(() => MenuItem.create(validProps({ targetMargin: m }))).not.toThrow();
  });

  it.each([-0.1, 1, 1.5])('rejects targetMargin out of range %s', (m) => {
    expect(() => MenuItem.create(validProps({ targetMargin: m }))).toThrow(/targetMargin/i);
  });

  it('rejects non-uuid organizationId / recipeId / locationId', () => {
    expect(() => MenuItem.create(validProps({ organizationId: 'nope' }))).toThrow(/organizationId|uuid/i);
    expect(() => MenuItem.create(validProps({ recipeId: 'nope' }))).toThrow(/recipeId|uuid/i);
    expect(() => MenuItem.create(validProps({ locationId: 'nope' }))).toThrow(/locationId|uuid/i);
  });
});

describe('MenuItem.applyUpdate', () => {
  it('updates mutable fields (channel, sellingPrice, targetMargin)', () => {
    const m = MenuItem.create(validProps());
    m.applyUpdate({ channel: 'DELIVERY', sellingPrice: 16, targetMargin: 0.7 });
    expect(m.channel).toBe('DELIVERY');
    expect(m.sellingPrice).toBe(16);
    expect(m.targetMargin).toBe(0.7);
  });

  it('refuses to change organizationId / recipeId / locationId (composite identity)', () => {
    const m = MenuItem.create(validProps());
    const fakeUuid = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    expect(() => m.applyUpdate({ organizationId: fakeUuid } as Parameters<typeof m.applyUpdate>[0])).toThrow(/organizationId|tenant/i);
    expect(() => m.applyUpdate({ recipeId: fakeUuid } as Parameters<typeof m.applyUpdate>[0])).toThrow(/recipeId|immutable/i);
    expect(() => m.applyUpdate({ locationId: fakeUuid } as Parameters<typeof m.applyUpdate>[0])).toThrow(/locationId|immutable/i);
  });
});

describe('MenuItem soft-delete', () => {
  it('toggles isActive', () => {
    const m = MenuItem.create(validProps());
    m.deactivate();
    expect(m.isActive).toBe(false);
    m.activate();
    expect(m.isActive).toBe(true);
  });
});
