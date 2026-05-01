import { UserLocation, UserLocationCreateProps } from './user-location.entity';

const userId = '11111111-1111-4111-8111-111111111111';
const locationId = '22222222-2222-4222-8222-222222222222';
const validProps = (overrides: Partial<UserLocationCreateProps> = {}): UserLocationCreateProps => ({
  userId,
  locationId,
  ...overrides,
});

describe('UserLocation.create', () => {
  it('returns an assignment with a UUID id and the given user/location ids', () => {
    const ul = UserLocation.create(validProps());
    expect(ul.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(ul.userId).toBe(userId);
    expect(ul.locationId).toBe(locationId);
  });

  it('rejects non-uuid userId', () => {
    expect(() => UserLocation.create(validProps({ userId: 'not-a-uuid' }))).toThrow(/userId|uuid/i);
  });

  it('rejects non-uuid locationId', () => {
    expect(() => UserLocation.create(validProps({ locationId: 'not-a-uuid' }))).toThrow(
      /locationId|uuid/i,
    );
  });

  it('rejects empty userId', () => {
    expect(() => UserLocation.create(validProps({ userId: '' }))).toThrow(/userId|uuid/i);
  });
});

describe('UserLocation immutability', () => {
  it('does not expose any setter method (assignment is a value object)', () => {
    const ul = UserLocation.create(validProps());
    // @ts-expect-error — assignments have no applyUpdate by design.
    expect(ul.applyUpdate).toBeUndefined();
  });
});
