// ============================================================
// strategy-selector — unit tests
// ============================================================

import { selectStrategy } from './strategy-selector';
import {
  StrategyMismatchError,
  UnknownStrategyError,
} from '../domain/errors';
import { Strategy } from '../domain/types';

const ORG = 'org-1';

describe('selectStrategy — 9 combinations', () => {
  const cases: Array<{
    product: Strategy;
    org: Strategy | null;
    expected: Strategy;
  }> = [
    { product: 'FIFO', org: null, expected: 'FIFO' },
    { product: 'FEFO', org: null, expected: 'FEFO' },
    { product: 'MANUAL', org: null, expected: 'MANUAL' },
    { product: 'FIFO', org: 'FIFO', expected: 'FIFO' },
    { product: 'FIFO', org: 'FEFO', expected: 'FEFO' },
    { product: 'FEFO', org: 'FIFO', expected: 'FIFO' },
    { product: 'FEFO', org: 'FEFO', expected: 'FEFO' },
    { product: 'MANUAL', org: 'FIFO', expected: 'FIFO' },
    { product: 'MANUAL', org: 'FEFO', expected: 'FEFO' },
  ];

  for (const c of cases) {
    it(`product=${c.product}, org=${c.org ?? 'null'} → ${c.expected}`, () => {
      expect(selectStrategy(c.product, c.org, ORG)).toBe(c.expected);
    });
  }
});

describe('selectStrategy — defensive errors', () => {
  it('throws StrategyMismatchError when org override is MANUAL', () => {
    expect(() => selectStrategy('FIFO', 'MANUAL', ORG)).toThrow(
      StrategyMismatchError,
    );
  });

  it('throws UnknownStrategyError when product value is not in enum', () => {
    expect(() =>
      selectStrategy('LIFO' as unknown as Strategy, null, ORG),
    ).toThrow(UnknownStrategyError);
  });

  it('throws UnknownStrategyError when org value is not in enum', () => {
    expect(() =>
      selectStrategy('FIFO', 'WEIGHTED' as unknown as Strategy, ORG),
    ).toThrow(UnknownStrategyError);
  });
});
