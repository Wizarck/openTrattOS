// ============================================================
// CostModule — env-flag toggle test (ADR-COST-DI-FEATURE-FLAG)
// ============================================================

import { isM3CostResolverEnabled, M3_COST_RESOLVER_ENABLED_ENV } from './cost.module';

describe('isM3CostResolverEnabled', () => {
  it('returns true when env var is unset (default-on)', () => {
    expect(isM3CostResolverEnabled({})).toBe(true);
  });

  it("returns true when env var is 'true'", () => {
    expect(
      isM3CostResolverEnabled({ [M3_COST_RESOLVER_ENABLED_ENV]: 'true' }),
    ).toBe(true);
  });

  it("returns false when env var is 'false'", () => {
    expect(
      isM3CostResolverEnabled({ [M3_COST_RESOLVER_ENABLED_ENV]: 'false' }),
    ).toBe(false);
  });

  it('treats any non-false string as enabled (forward compat)', () => {
    expect(isM3CostResolverEnabled({ [M3_COST_RESOLVER_ENABLED_ENV]: 'yes' })).toBe(
      true,
    );
    expect(isM3CostResolverEnabled({ [M3_COST_RESOLVER_ENABLED_ENV]: '1' })).toBe(
      true,
    );
  });
});
