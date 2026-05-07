import { describe, it, expect } from 'vitest';
import {
  parseReport,
  findRegressions,
  isSyntheticBaseline,
} from './regression-check.js';

const HEADER =
  '| Capability | Calls | OK | Errors | p50 (ms) | p95 (ms) | Throughput (req/s) | Error rate |';
const SEPARATOR = '|---|---:|---:|---:|---:|---:|---:|---:|';

function buildReport(rows: Array<{ cap: string; p95: number }>): string {
  return [
    '# MCP-client bench — sample',
    '',
    '## Results',
    '',
    HEADER,
    SEPARATOR,
    ...rows.map(
      (r) => `| \`${r.cap}\` | 100 | 99 | 1 | 40 | ${r.p95} | 1.65 | 1.00% |`,
    ),
    '',
    'Wave 1.13 [3c]',
  ].join('\n');
}

describe('parseReport', () => {
  it('extracts capability + p95 from a well-formed report', () => {
    const md = buildReport([
      { cap: 'recipes.read', p95: 88.5 },
      { cap: 'recipes.list', p95: 110 },
    ]);
    const parsed = parseReport(md);
    expect(parsed.ok).toBe(true);
    expect(parsed.rows).toEqual([
      { capability: 'recipes.read', p95: 88.5 },
      { capability: 'recipes.list', p95: 110 },
    ]);
  });

  it('fails ok=false when the header is missing', () => {
    const parsed = parseReport('# no table here\nplain text');
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toMatch(/header not found/i);
  });

  it('fails ok=false on a malformed row', () => {
    const md = [
      HEADER,
      SEPARATOR,
      '| `recipes.read` | not-enough-columns |',
    ].join('\n');
    const parsed = parseReport(md);
    expect(parsed.ok).toBe(false);
  });
});

describe('isSyntheticBaseline', () => {
  it('returns true when every row has p95=0', () => {
    expect(
      isSyntheticBaseline([
        { capability: 'a', p95: 0 },
        { capability: 'b', p95: 0 },
      ]),
    ).toBe(true);
  });

  it('returns false when any row has p95>0', () => {
    expect(
      isSyntheticBaseline([
        { capability: 'a', p95: 0 },
        { capability: 'b', p95: 50 },
      ]),
    ).toBe(false);
  });
});

describe('findRegressions', () => {
  const baseline = [
    { capability: 'recipes.read', p95: 100 },
    { capability: 'recipes.list', p95: 200 },
  ];

  it('returns [] when no capability regressed beyond threshold', () => {
    const newRows = [
      { capability: 'recipes.read', p95: 110 }, // +10%
      { capability: 'recipes.list', p95: 220 }, // +10%
    ];
    expect(findRegressions(newRows, baseline, 20)).toEqual([]);
  });

  it('returns the offending capability when threshold is exceeded', () => {
    const newRows = [
      { capability: 'recipes.read', p95: 100 }, // 0%
      { capability: 'recipes.list', p95: 260 }, // +30%
    ];
    const out = findRegressions(newRows, baseline, 20);
    expect(out).toHaveLength(1);
    expect(out[0].capability).toBe('recipes.list');
    expect(out[0].deltaPct).toBeGreaterThan(20);
  });

  it('exact-threshold regression is NOT flagged (strict > comparison)', () => {
    const newRows = [{ capability: 'recipes.read', p95: 120 }]; // exactly +20%
    expect(findRegressions(newRows, baseline, 20)).toEqual([]);
  });

  it('skips capabilities not present in baseline (added capability is not a regression)', () => {
    const newRows = [
      { capability: 'recipes.read', p95: 100 },
      { capability: 'newly.added', p95: 999 }, // huge but absent from baseline
    ];
    expect(findRegressions(newRows, baseline, 20)).toEqual([]);
  });

  it('skips per-row p95=0 entries in baseline (avoids div-by-zero)', () => {
    const baseWithZero = [
      { capability: 'recipes.read', p95: 0 },
      { capability: 'recipes.list', p95: 200 },
    ];
    const newRows = [
      { capability: 'recipes.read', p95: 100 },
      { capability: 'recipes.list', p95: 220 },
    ];
    expect(findRegressions(newRows, baseWithZero, 20)).toEqual([]);
  });
});
