// ============================================================
// round4 — numeric(18,4) precision helper (m3-inventory-cost-resolver-fifo-fefo)
// ============================================================
//
// All subtotals + totals are rounded to 4 decimal places, matching:
//   - DB column precision: `numeric(18,4)`
//   - M2 ROLLUP_TOLERANCE = 0.0001 per ADR-016
//
// We use `Math.round(value * 1e4) / 1e4` rather than `toFixed(4)` to
// avoid string allocation in tight loops (perf-test path runs 10k
// resolutions; even small allocations add up).

export const ROLLUP_TOLERANCE = 0.0001;

export function round4(value: number): number {
  return Math.round(value * 1e4) / 1e4;
}
