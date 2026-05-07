#!/usr/bin/env -S npx tsx
/**
 * Regression check for the MCP-bench reports written by `src/lib/report.ts`.
 *
 * Argv:
 *   regression-check <new-report.md> <baseline-report.md> <threshold-pct>
 *
 * Exit codes:
 *   0 — no regression beyond threshold (or baseline is synthetic; see SD1)
 *   1 — at least one capability's p95 regressed by more than threshold-pct
 *   2 — input could not be parsed (file missing, no results table, malformed row)
 *
 * Per ADR (m2-mcp-bench-ci design.md SD1): a baseline whose p95 column is all
 * zeroes across every capability row is treated as "synthetic; skipped" and
 * the script exits 0. The first real run committed becomes the first non-
 * synthetic baseline.
 */
import { readFileSync, existsSync } from 'node:fs';

interface ParsedRow {
  capability: string;
  p95: number;
}

interface ParseResult {
  ok: boolean;
  rows: ParsedRow[];
  error?: string;
}

const HEADER_REGEX =
  /^\|\s*Capability\s*\|\s*Calls\s*\|\s*OK\s*\|\s*Errors\s*\|\s*p50\s*\(ms\)\s*\|\s*p95\s*\(ms\)\s*\|\s*Throughput\s*\(req\/s\)\s*\|\s*Error rate\s*\|\s*$/;

export function parseReport(markdown: string): ParseResult {
  const lines = markdown.split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => HEADER_REGEX.test(l));
  if (headerIdx === -1) {
    return { ok: false, rows: [], error: 'header not found' };
  }
  // Separator row immediately follows the header; skip it.
  const dataStart = headerIdx + 2;
  const rows: ParsedRow[] = [];
  for (let i = dataStart; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('|')) break;
    const cols = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    if (cols.length < 6) {
      return { ok: false, rows: [], error: `malformed row at line ${i + 1}` };
    }
    // Strip backticks from capability cell.
    const capability = cols[0].replace(/^`(.*)`$/, '$1');
    const p95 = Number(cols[5]);
    if (!capability || Number.isNaN(p95)) {
      return { ok: false, rows: [], error: `bad capability/p95 at line ${i + 1}` };
    }
    rows.push({ capability, p95 });
  }
  if (rows.length === 0) {
    return { ok: false, rows: [], error: 'no data rows' };
  }
  return { ok: true, rows };
}

export function isSyntheticBaseline(rows: ParsedRow[]): boolean {
  // SD1: every capability has p95=0 → synthetic placeholder.
  return rows.length > 0 && rows.every((r) => r.p95 === 0);
}

export interface RegressionFinding {
  capability: string;
  baselineP95: number;
  newP95: number;
  deltaPct: number;
}

export function findRegressions(
  newRows: ParsedRow[],
  baseRows: ParsedRow[],
  thresholdPct: number,
): RegressionFinding[] {
  const baseMap = new Map(baseRows.map((r) => [r.capability, r]));
  const findings: RegressionFinding[] = [];
  for (const r of newRows) {
    const base = baseMap.get(r.capability);
    if (!base) continue; // newly added capability; not a regression
    if (base.p95 === 0) continue; // safety: avoid div-by-zero on per-row synthetic
    const deltaPct = ((r.p95 - base.p95) / base.p95) * 100;
    if (deltaPct > thresholdPct) {
      findings.push({
        capability: r.capability,
        baselineP95: base.p95,
        newP95: r.p95,
        deltaPct,
      });
    }
  }
  return findings;
}

function main(): number {
  const [, , newPath, basePath, thresholdRaw] = process.argv;
  if (!newPath || !basePath || !thresholdRaw) {
    console.error('usage: regression-check <new.md> <baseline.md> <threshold-pct>');
    return 2;
  }
  const threshold = Number(thresholdRaw);
  if (Number.isNaN(threshold) || threshold < 0) {
    console.error(`invalid threshold: ${thresholdRaw}`);
    return 2;
  }
  if (!existsSync(newPath)) {
    console.error(`new report not found: ${newPath}`);
    return 2;
  }
  if (!existsSync(basePath)) {
    console.error(`baseline not found: ${basePath} — first report; no comparison`);
    return 0;
  }

  const newParsed = parseReport(readFileSync(newPath, 'utf8'));
  if (!newParsed.ok) {
    console.error(`could not parse new report: ${newParsed.error}`);
    return 2;
  }
  const baseParsed = parseReport(readFileSync(basePath, 'utf8'));
  if (!baseParsed.ok) {
    console.error(`could not parse baseline: ${baseParsed.error}`);
    return 2;
  }

  if (isSyntheticBaseline(baseParsed.rows)) {
    console.log(`baseline ${basePath} is synthetic (all p95=0); skipping comparison`);
    return 0;
  }

  const regressions = findRegressions(newParsed.rows, baseParsed.rows, threshold);
  if (regressions.length === 0) {
    console.log(
      `OK — no p95 regression > ${threshold}% across ${newParsed.rows.length} capability rows`,
    );
    return 0;
  }
  console.error(`REGRESSION — ${regressions.length} capability(ies) over ${threshold}%:`);
  for (const r of regressions) {
    console.error(
      `  ${r.capability}: ${r.baselineP95.toFixed(2)} → ${r.newP95.toFixed(2)} ms (+${r.deltaPct.toFixed(1)}%)`,
    );
  }
  return 1;
}

// Only run when invoked directly (not when imported by tests).
const invokedDirectly = import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('regression-check.ts') ||
  process.argv[1]?.endsWith('regression-check.js');

if (invokedDirectly) {
  process.exit(main());
}
