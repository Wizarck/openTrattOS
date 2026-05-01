import { Organization, OrganizationCreateProps } from './organization.entity';

const validProps = (overrides: Partial<OrganizationCreateProps> = {}): OrganizationCreateProps => ({
  name: 'Acme Restaurants S.L.',
  currencyCode: 'EUR',
  defaultLocale: 'es',
  timezone: 'Europe/Madrid',
  ...overrides,
});

describe('Organization.create', () => {
  it('returns an Organization with a UUID id and the given props', () => {
    const org = Organization.create(validProps());
    expect(org.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(org.name).toBe('Acme Restaurants S.L.');
    expect(org.currencyCode).toBe('EUR');
    expect(org.defaultLocale).toBe('es');
    expect(org.timezone).toBe('Europe/Madrid');
  });

  it('rejects an empty name', () => {
    expect(() => Organization.create(validProps({ name: '' }))).toThrow(/name/i);
    expect(() => Organization.create(validProps({ name: '   ' }))).toThrow(/name/i);
  });

  describe('currencyCode (ISO 4217)', () => {
    it.each(['EUR', 'USD', 'GBP', 'JPY', 'CHF'])('accepts %s', (code) => {
      expect(() => Organization.create(validProps({ currencyCode: code }))).not.toThrow();
    });

    it.each(['eur', 'EU', 'EUROS', 'E1R', '123', ''])('rejects invalid code "%s"', (code) => {
      expect(() => Organization.create(validProps({ currencyCode: code }))).toThrow(
        /currencyCode|ISO 4217/i,
      );
    });
  });

  describe('defaultLocale', () => {
    it.each(['es', 'en', 'fr', 'de', 'it', 'pt', 'ca', 'eu'])('accepts %s', (locale) => {
      expect(() => Organization.create(validProps({ defaultLocale: locale }))).not.toThrow();
    });

    it.each(['ES', 'spanish', 'es-ES', 'e', 'esp', ''])('rejects invalid locale "%s"', (locale) => {
      expect(() => Organization.create(validProps({ defaultLocale: locale }))).toThrow(/locale/i);
    });
  });

  it('requires a non-empty timezone (IANA-shaped, presence-only validation)', () => {
    expect(() => Organization.create(validProps({ timezone: '' }))).toThrow(/timezone/i);
    expect(() => Organization.create(validProps({ timezone: 'Europe/Madrid' }))).not.toThrow();
    expect(() => Organization.create(validProps({ timezone: 'America/New_York' }))).not.toThrow();
  });
});

describe('Organization currency immutability (ADR-007 / D6)', () => {
  it('does not expose a setter for currencyCode after creation', () => {
    const org = Organization.create(validProps({ currencyCode: 'EUR' }));
    // Direct property mutation must be impossible without a cast — we assert by
    // describing the property and checking it is read-only at the descriptor level.
    const descriptor = Object.getOwnPropertyDescriptor(org, 'currencyCode');
    expect(descriptor?.writable).toBe(false);
  });

  it('throws when applyUpdate is called with currencyCode in the patch', () => {
    const org = Organization.create(validProps({ currencyCode: 'EUR' }));
    expect(() =>
      org.applyUpdate({ currencyCode: 'USD' } as Parameters<typeof org.applyUpdate>[0]),
    ).toThrow(/currency.*immutable|cannot.*currency/i);
    expect(org.currencyCode).toBe('EUR');
  });

  it('applyUpdate accepts mutable fields (name, defaultLocale, timezone)', () => {
    const org = Organization.create(validProps());
    org.applyUpdate({ name: 'Acme Renamed', defaultLocale: 'en', timezone: 'America/New_York' });
    expect(org.name).toBe('Acme Renamed');
    expect(org.defaultLocale).toBe('en');
    expect(org.timezone).toBe('America/New_York');
  });
});
