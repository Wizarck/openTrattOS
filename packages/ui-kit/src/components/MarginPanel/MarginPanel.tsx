import { cn } from '../../lib/cn';
import type { MarginPanelProps, MarginStatus } from './MarginPanel.types';

const STATUS_STYLES: Record<MarginStatus, { bg: string; fg: string; border: string }> = {
  on_target: {
    bg: 'var(--color-status-on-target)',
    fg: 'var(--color-accent-fg)',
    border: 'var(--color-status-on-target)',
  },
  below_target: {
    bg: 'var(--color-status-below-target)',
    fg: 'var(--color-status-below-target-fg)',
    border: 'var(--color-border-strong)',
  },
  at_risk: {
    bg: 'var(--color-status-at-risk)',
    fg: 'var(--color-status-at-risk-fg)',
    border: 'var(--color-status-at-risk)',
  },
  unknown: {
    bg: 'var(--color-status-unknown)',
    fg: 'var(--color-status-unknown-fg)',
    border: 'var(--color-border)',
  },
};

/**
 * Live margin report panel for a MenuItem (Recipe × Location × Channel).
 * Status colour is ALWAYS paired with the `statusLabel` text per ADR-016
 * (never colour-only). Loading state renders a skeleton; unknown state
 * surfaces the first warning under the panel.
 */
export function MarginPanel({
  report,
  loading = false,
  locale = 'en-EU',
  className,
}: MarginPanelProps) {
  if (loading || !report) {
    return (
      <div
        role="region"
        aria-label="Margin report"
        aria-busy="true"
        className={cn(
          'rounded-md border border-border bg-surface-2 p-4',
          'animate-pulse',
          className,
        )}
      >
        <div className="h-4 w-24 rounded bg-border-strong" />
        <div className="mt-3 h-8 w-32 rounded bg-border-strong" />
        <div className="mt-2 h-3 w-40 rounded bg-border" />
      </div>
    );
  }

  const styles = STATUS_STYLES[report.status];
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: report.currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const percentFormatter = new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });

  return (
    <div
      role="region"
      aria-label={`Margin report — ${report.statusLabel}`}
      className={cn('rounded-md border border-border bg-surface p-4', className)}
    >
      <div className="grid grid-cols-3 gap-3">
        <Metric label="Cost" value={report.cost === null ? '—' : formatter.format(report.cost)} />
        <Metric label="Selling price" value={formatter.format(report.sellingPrice)} />
        <Metric
          label={`Margin (target ${percentFormatter.format(report.targetMargin)})`}
          value={
            report.marginPercent === null
              ? '—'
              : `${percentFormatter.format(report.marginPercent)}`
          }
        />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span
          className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-sm font-semibold"
          style={{ backgroundColor: styles.bg, color: styles.fg, borderColor: styles.border }}
        >
          <StatusDot status={report.status} />
          {report.statusLabel}
        </span>
        {report.recipeDiscontinued && (
          <span className="text-xs text-mute">(Recipe discontinued)</span>
        )}
      </div>

      {report.warnings.length > 0 && (
        <ul className="mt-2 list-none space-y-1 p-0">
          {report.warnings.map((w, i) => (
            <li key={i} className="text-xs text-mute" role="note">
              {w}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-mute">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums text-ink">{value}</div>
    </div>
  );
}

function StatusDot({ status }: { status: MarginStatus }) {
  // Decorative circle paired with text label; keep aria-hidden so the
  // screen-reader doesn't double-announce the status (label carries it).
  return (
    <span
      aria-hidden="true"
      className="inline-block h-2 w-2 rounded-pill"
      style={{
        backgroundColor:
          status === 'unknown' ? 'var(--color-mute)' : 'currentColor',
      }}
    />
  );
}
