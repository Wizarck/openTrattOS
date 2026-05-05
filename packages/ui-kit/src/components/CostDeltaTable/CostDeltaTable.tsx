import { useMemo } from 'react';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { cn } from '../../lib/cn';
import type {
  CostDeltaDirection,
  CostDeltaRow,
  CostDeltaTableProps,
} from './CostDeltaTable.types';

const DIRECTION_STYLES: Record<
  CostDeltaDirection,
  { color: string; icon: typeof ArrowUp; label: string }
> = {
  increase: { color: 'var(--color-status-at-risk)', icon: ArrowUp, label: 'increase' },
  decrease: { color: 'var(--color-status-on-target)', icon: ArrowDown, label: 'decrease' },
  unchanged: { color: 'var(--color-mute)', icon: Minus, label: 'no change' },
};

/**
 * Per-component "what changed?" table for J2 (cost-spike investigation).
 * Rows colour-code by direction (at-risk / on-target / muted) AND carry an
 * arrow icon for deuteranopia safety. Sorted by absolute delta magnitude
 * descending — biggest movers at the top.
 */
export function CostDeltaTable({
  rows,
  loading = false,
  emptyStateCopy = 'No cost changes in this window',
  locale = 'en-EU',
  caption,
  className,
}: CostDeltaTableProps) {
  const sorted = useMemo(
    () => [...rows].sort((a, b) => Math.abs(b.deltaAbsolute) - Math.abs(a.deltaAbsolute)),
    [rows],
  );

  if (loading) {
    return (
      <div
        role="region"
        aria-label="Cost deltas"
        aria-busy="true"
        className={cn(
          'rounded-md border border-border bg-surface-2 p-4 animate-pulse',
          className,
        )}
        style={{ borderWidth: '1px', borderStyle: 'solid' }}
      >
        <div className="h-4 w-32 rounded bg-border-strong" />
        <div className="mt-3 h-3 w-full rounded bg-border" />
        <div className="mt-2 h-3 w-full rounded bg-border" />
        <div className="mt-2 h-3 w-3/4 rounded bg-border" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div
        role="region"
        aria-label="Cost deltas"
        className={cn(
          'rounded-md border border-border bg-surface p-4 text-sm text-mute',
          className,
        )}
        style={{ borderWidth: '1px', borderStyle: 'solid' }}
      >
        {emptyStateCopy}
      </div>
    );
  }

  return (
    <div
      className={cn('overflow-x-auto rounded-md border border-border bg-surface', className)}
      style={{ borderWidth: '1px', borderStyle: 'solid' }}
    >
      <table className="min-w-full divide-y divide-border text-sm">
        {caption && <caption className="px-4 py-2 text-left text-sm text-mute">{caption}</caption>}
        <thead className="bg-surface-2">
          <tr>
            <th scope="col" className="px-4 py-2 text-left font-semibold text-ink">
              Component
            </th>
            <th scope="col" className="px-4 py-2 text-right font-semibold text-ink">
              Before
            </th>
            <th scope="col" className="px-4 py-2 text-right font-semibold text-ink">
              After
            </th>
            <th scope="col" className="px-4 py-2 text-right font-semibold text-ink">
              Δ%
            </th>
            <th scope="col" className="px-4 py-2 text-right font-semibold text-ink">
              Δ€
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sorted.map((row) => (
            <Row key={row.componentId} row={row} locale={locale} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({ row, locale }: { row: CostDeltaRow; locale: string }) {
  const styles = DIRECTION_STYLES[row.direction];
  const Icon = styles.icon;
  const currencyFmt = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: row.currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: 'always',
  });
  const baseFmt = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: row.currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const percentFmt = new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: 'always',
  });

  return (
    <tr>
      <td className="px-4 py-2 text-ink">{row.componentName}</td>
      <td className="px-4 py-2 text-right tabular-nums text-ink">
        {row.oldCost === null ? '—' : baseFmt.format(row.oldCost)}
      </td>
      <td className="px-4 py-2 text-right tabular-nums text-ink">
        {row.newCost === null ? '—' : baseFmt.format(row.newCost)}
      </td>
      <td className="px-4 py-2 text-right tabular-nums" style={{ color: styles.color }}>
        <span className="inline-flex items-center justify-end gap-1">
          <Icon
            aria-hidden="true"
            size={14}
            data-direction={row.direction}
            data-testid={`delta-icon-${row.direction}`}
          />
          {row.deltaPercent === null ? '—' : percentFmt.format(row.deltaPercent)}
        </span>
      </td>
      <td className="px-4 py-2 text-right tabular-nums" style={{ color: styles.color }}>
        {currencyFmt.format(row.deltaAbsolute)}
        <span className="sr-only"> {styles.label}</span>
      </td>
    </tr>
  );
}
