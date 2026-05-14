// ============================================================
// CSV property-based test harness (m3-inventory-cost-resolver-fifo-fefo)
// ============================================================
//
// Per ADR-COST-PROPERTY-TEST-CSV: loops over canonical
// `__fixtures__/fifo-fefo-cases.csv` rows, exercising the pure
// resolvers (`resolveFifo` / `resolveFefo`) and asserting:
//   - total cost matches expected (within ROLLUP_TOLERANCE)
//   - breakdown rows match expected lotId / qty / subtotal
//   - remaining lots match expected post-consumption state
//   - error rows throw `InsufficientInventoryError` (and not a different error)
//
// Failure messages include the CSV `case_id` for surgical fixing per
// ADR-COST-PROPERTY-TEST-CSV §Harness.
//
// CJS interop note per [[feedback_subagent_apply_typing_fix_cascade]]:
//   `import { parse } from 'csv-parse/sync'` — the named export from
//   `csv-parse/sync` works under both CJS and ESM resolution.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';
import { resolveFifo } from './fifo.resolver';
import { resolveFefo } from './fefo.resolver';
import { InsufficientInventoryError } from '../domain/errors';
import { LotCostRow, Strategy } from '../domain/types';
import { ROLLUP_TOLERANCE } from './round';

interface CsvRow {
  case_id: string;
  strategy: string;
  lots_json: string;
  qty_requested: string;
  expected_total_cost: string;
  expected_breakdown_json: string;
  expected_remaining_lots_json: string;
  expected_error: string;
}

interface InputLotJson {
  id: string;
  receivedAt?: string;
  expiresAt?: string | null;
  qtyRemaining: number;
  unitCost: number;
}

interface ExpectedBreakdownJson {
  lotId: string;
  qty: number;
  subtotal: number;
}

interface ExpectedRemainingJson {
  id: string;
  qtyRemaining: number;
}

const FIXTURE_PATH = join(__dirname, '..', '__fixtures__', 'fifo-fefo-cases.csv');

function loadRows(): CsvRow[] {
  const csvText = readFileSync(FIXTURE_PATH, 'utf-8');
  return parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as CsvRow[];
}

function toLotCostRow(raw: InputLotJson, productId: string, currency: string): LotCostRow {
  return {
    id: raw.id,
    organizationId: 'org-test',
    locationId: 'loc-test',
    productId,
    receivedAt: raw.receivedAt ? new Date(raw.receivedAt) : new Date('1970-01-01T00:00:00Z'),
    expiresAt: raw.expiresAt ? new Date(raw.expiresAt) : null,
    quantityRemaining: raw.qtyRemaining,
    unitCostAtReceived: raw.unitCost,
    currency,
  };
}

describe('FIFO/FEFO resolvers — property-based CSV fixture', () => {
  const rows = loadRows();

  it('loads at least 30 fixture rows', () => {
    expect(rows.length).toBeGreaterThanOrEqual(30);
  });

  for (const row of rows) {
    it(`case ${row.case_id} (${row.strategy})`, () => {
      const productId = 'product-test';
      const currency = 'EUR';
      const asOfTime = new Date('2026-05-15T00:00:00Z');
      const rawLots = JSON.parse(row.lots_json) as InputLotJson[];
      const lots: LotCostRow[] = rawLots.map((r) => toLotCostRow(r, productId, currency));
      const qty = Number.parseFloat(row.qty_requested);
      const strategy = row.strategy as Strategy;

      const invoke = (): ReturnType<typeof resolveFifo> => {
        if (strategy === 'FIFO') {
          return resolveFifo(lots, qty, currency, asOfTime, 'org-test', productId);
        }
        if (strategy === 'FEFO') {
          return resolveFefo(lots, qty, currency, asOfTime, 'org-test', productId);
        }
        throw new Error(`Unsupported strategy ${strategy} in case ${row.case_id}`);
      };

      if (row.expected_error) {
        try {
          invoke();
          throw new Error(
            `Case ${row.case_id}: expected ${row.expected_error} but resolver returned a result`,
          );
        } catch (err) {
          if (err instanceof InsufficientInventoryError) {
            expect(err.name).toBe('InsufficientInventoryError');
          } else if (
            row.expected_error === 'InsufficientInventoryError' &&
            err instanceof Error &&
            err.message.startsWith(`Case ${row.case_id}:`)
          ) {
            // The synthetic "expected X but got result" failure above.
            throw err;
          } else {
            throw new Error(
              `Case ${row.case_id}: expected ${row.expected_error}, got ${(err as Error).name}: ${(err as Error).message}`,
            );
          }
        }
        return;
      }

      const result = invoke();

      // ---- Total cost ----
      const expectedTotal = Number.parseFloat(row.expected_total_cost);
      expect({
        case: row.case_id,
        total: result.totalCost,
      }).toEqual({
        case: row.case_id,
        total: expect.closeTo(expectedTotal, 4),
      });

      // ---- Breakdown ----
      const expectedBreakdown = JSON.parse(
        row.expected_breakdown_json,
      ) as ExpectedBreakdownJson[];
      expect({
        case: row.case_id,
        breakdownLength: result.breakdown.length,
      }).toEqual({
        case: row.case_id,
        breakdownLength: expectedBreakdown.length,
      });
      for (let i = 0; i < expectedBreakdown.length; i++) {
        const exp = expectedBreakdown[i];
        const got = result.breakdown[i];
        expect({
          case: row.case_id,
          idx: i,
          lotId: got.lotId,
          qty: got.qty,
          subtotal: got.subtotal,
        }).toEqual({
          case: row.case_id,
          idx: i,
          lotId: exp.lotId,
          qty: expect.closeTo(exp.qty, 4),
          subtotal: expect.closeTo(exp.subtotal, 4),
        });
      }

      // ---- Remaining lots ----
      const expectedRemaining = JSON.parse(
        row.expected_remaining_lots_json,
      ) as ExpectedRemainingJson[];
      expect({
        case: row.case_id,
        remainingLength: result.remainingLots.length,
      }).toEqual({
        case: row.case_id,
        remainingLength: expectedRemaining.length,
      });
      // Build maps so order-agnostic compare on remaining lots.
      const gotMap = new Map(
        result.remainingLots.map((r) => [r.id, r.quantityRemaining]),
      );
      for (const exp of expectedRemaining) {
        expect({
          case: row.case_id,
          id: exp.id,
          qtyRemaining: gotMap.get(exp.id) ?? null,
        }).toEqual({
          case: row.case_id,
          id: exp.id,
          qtyRemaining: expect.closeTo(exp.qtyRemaining, 4),
        });
      }
    });
  }

  it('ROLLUP_TOLERANCE is published', () => {
    expect(ROLLUP_TOLERANCE).toBe(0.0001);
  });
});
