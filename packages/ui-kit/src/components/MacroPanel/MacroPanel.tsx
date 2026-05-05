import { cn } from '../../lib/cn';
import {
  MACRO_LABELS,
  MacroPanelProps,
  PRIMARY_MACRO_KEYS,
} from './MacroPanel.types';

/**
 * Recipe macro panel. Compact = per-portion only; expanded = per-portion +
 * per-100g side-by-side. ODbL attribution line is ALWAYS visible when any
 * ingredient has `externalSourceRef` populated (Gate D decision 3a — compliance
 * margin > UI density). Keys ordered per `PRIMARY_MACRO_KEYS` then alphabetic.
 */
export function MacroPanel({
  rollup,
  loading = false,
  mode = 'compact',
  locale = 'en-EU',
  emptyStateCopy = 'No nutrition data available.',
  className,
}: MacroPanelProps) {
  if (loading || !rollup) {
    return (
      <div
        role="region"
        aria-label="Recipe macros"
        aria-busy="true"
        className={cn(
          'rounded-md border border-border bg-surface-2 p-4 animate-pulse',
          className,
        )}
        style={{ borderWidth: '1px', borderStyle: 'solid' }}
      >
        <div className="h-4 w-32 rounded bg-border-strong" />
        <div className="mt-3 h-3 w-full rounded bg-border" />
        <div className="mt-2 h-3 w-3/4 rounded bg-border" />
      </div>
    );
  }

  const portionKeys = orderedKeys(rollup.perPortion);
  const per100gKeys = orderedKeys(rollup.per100g);
  const allKeys = Array.from(new Set([...portionKeys, ...per100gKeys]));

  if (allKeys.length === 0) {
    return (
      <div
        role="region"
        aria-label="Recipe macros"
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

  const numberFmt = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });

  const per100Visible = mode === 'expanded' && per100gKeys.length > 0;
  const hasExternalSources = rollup.externalSources.length > 0;

  return (
    <div
      role="region"
      aria-label="Recipe macros"
      className={cn(
        'rounded-md border border-border bg-surface p-4',
        className,
      )}
      style={{ borderWidth: '1px', borderStyle: 'solid' }}
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left">
            <th scope="col" className="pb-2 pr-4 font-semibold text-ink">
              Macro
            </th>
            <th scope="col" className="pb-2 pr-4 text-right font-semibold text-ink">
              Per portion
            </th>
            {per100Visible && (
              <th scope="col" className="pb-2 text-right font-semibold text-ink">
                Per 100 g
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {allKeys.map((key) => (
            <tr key={key} className="border-t border-border">
              <th scope="row" className="py-1.5 pr-4 font-normal text-ink">
                {MACRO_LABELS[key] ?? key}
              </th>
              <td className="py-1.5 pr-4 text-right tabular-nums text-ink">
                {key in rollup.perPortion ? numberFmt.format(rollup.perPortion[key]) : '—'}
              </td>
              {per100Visible && (
                <td className="py-1.5 text-right tabular-nums text-ink">
                  {key in rollup.per100g ? numberFmt.format(rollup.per100g[key]) : '—'}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {rollup.totalWeightG !== null && mode === 'expanded' && (
        <p className="mt-3 text-xs text-mute">
          Total weight: <span className="tabular-nums">{numberFmt.format(rollup.totalWeightG)} g</span>
        </p>
      )}

      {hasExternalSources && (
        <p
          className="mt-3 text-xs text-mute"
          role="note"
          data-testid="odbl-attribution"
        >
          Some nutritional data from{' '}
          <a
            href="https://world.openfoodfacts.org"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-ink"
          >
            Open Food Facts
          </a>{' '}
          (ODbL).
        </p>
      )}
    </div>
  );
}

function orderedKeys(map: Record<string, number>): string[] {
  const keys = Object.keys(map);
  if (keys.length === 0) return [];
  const primary = PRIMARY_MACRO_KEYS.filter((k) => k in map);
  const extras = keys.filter((k) => !PRIMARY_MACRO_KEYS.includes(k)).sort();
  return [...primary, ...extras];
}
