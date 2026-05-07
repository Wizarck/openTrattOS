import type { CapabilityName, CapabilityStats, RunSample } from './types.js';

/**
 * Aggregate per-capability stats from a flat `RunSample[]`. Returns one
 * `CapabilityStats` row per distinct capability; capabilities with zero
 * samples are omitted.
 */
export function summarise(samples: RunSample[], windowSec: number): CapabilityStats[] {
  const byCap = new Map<CapabilityName, RunSample[]>();
  for (const s of samples) {
    const arr = byCap.get(s.capability) ?? [];
    arr.push(s);
    byCap.set(s.capability, arr);
  }
  const rows: CapabilityStats[] = [];
  for (const [cap, arr] of byCap.entries()) {
    const ok = arr.filter((s) => s.ok);
    const sorted = [...ok.map((s) => s.durationMs)].sort((a, b) => a - b);
    rows.push({
      capability: cap,
      calls: arr.length,
      ok: ok.length,
      errors: arr.length - ok.length,
      p50: percentile(sorted, 0.5),
      p95: percentile(sorted, 0.95),
      throughput: windowSec > 0 ? +(arr.length / windowSec).toFixed(2) : 0,
      errorRate: arr.length > 0 ? +((arr.length - ok.length) / arr.length).toFixed(4) : 0,
    });
  }
  rows.sort((a, b) => a.capability.localeCompare(b.capability));
  return rows;
}

/**
 * Percentile over an already-sorted array of numbers. Linear interpolation
 * between adjacent samples at the percentile rank. Returns 0 for empty
 * input (so the report renders a numeric cell instead of NaN).
 */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return +sorted[0].toFixed(2);
  const rank = p * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return +sorted[lo].toFixed(2);
  const frac = rank - lo;
  return +(sorted[lo] + (sorted[hi] - sorted[lo]) * frac).toFixed(2);
}
