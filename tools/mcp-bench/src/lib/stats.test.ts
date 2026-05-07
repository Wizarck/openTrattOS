import { describe, expect, it } from 'vitest';
import { percentile, summarise } from './stats.js';
import type { RunSample } from './types.js';

describe('percentile', () => {
  it('returns 0 for empty input (renders cleanly in the report)', () => {
    expect(percentile([], 0.5)).toBe(0);
  });

  it('handles single-element arrays', () => {
    expect(percentile([42], 0.5)).toBe(42);
    expect(percentile([42], 0.95)).toBe(42);
  });

  it('linear-interpolates between adjacent samples', () => {
    expect(percentile([10, 20, 30, 40, 50], 0.5)).toBe(30);
    expect(percentile([10, 20, 30, 40, 50], 0.95)).toBe(48);
  });
});

describe('summarise', () => {
  it('groups samples by capability and computes per-row stats', () => {
    const samples: RunSample[] = [
      { capability: 'recipes.list', durationMs: 10, ok: true },
      { capability: 'recipes.list', durationMs: 30, ok: true },
      { capability: 'recipes.list', durationMs: 50, ok: false, errorMessage: 'oops' },
      { capability: 'recipes.read', durationMs: 100, ok: true },
    ];
    const rows = summarise(samples, 60);
    expect(rows).toHaveLength(2);
    const list = rows.find((r) => r.capability === 'recipes.list')!;
    expect(list.calls).toBe(3);
    expect(list.ok).toBe(2);
    expect(list.errors).toBe(1);
    expect(list.errorRate).toBe(+(1 / 3).toFixed(4));
    expect(list.throughput).toBe(0.05); // 3 calls / 60s
  });

  it('handles all-error capabilities without NaN p50/p95', () => {
    const samples: RunSample[] = [
      { capability: 'recipes.list', durationMs: 10, ok: false, errorMessage: 'x' },
      { capability: 'recipes.list', durationMs: 20, ok: false, errorMessage: 'x' },
    ];
    const rows = summarise(samples, 60);
    expect(rows[0].p50).toBe(0);
    expect(rows[0].p95).toBe(0);
    expect(rows[0].errorRate).toBe(1);
  });

  it('handles zero-duration window without dividing by zero', () => {
    const samples: RunSample[] = [{ capability: 'recipes.list', durationMs: 10, ok: true }];
    const rows = summarise(samples, 0);
    expect(rows[0].throughput).toBe(0);
  });
});
