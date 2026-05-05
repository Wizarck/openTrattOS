import { useId, useMemo, useState, useEffect } from 'react';
import { Check } from 'lucide-react';
import { cn } from '../../lib/cn';
import type { SourceOverridePickerProps, SupplierItemOption } from './SourceOverridePicker.types';

/**
 * Radio-list of SupplierItem options for "Edit source" UX. Preferred option
 * renders FIRST with a visible badge; ties break by price ascending. "Use
 * preferred" clears the recipe-line override (per Gate D decision 1a).
 */
export function SourceOverridePicker({
  options,
  currentOverrideId,
  onApply,
  onClear,
  locale = 'en-EU',
  emptyStateCopy = 'No supplier sources available',
  className,
  'aria-label': ariaLabel = 'Source override',
}: SourceOverridePickerProps) {
  const groupId = useId();
  const sorted = useMemo(() => sortOptions(options), [options]);

  const initialSelected =
    currentOverrideId ??
    sorted.find((o) => o.isPreferred)?.id ??
    sorted[0]?.id ??
    null;

  const [selectedId, setSelectedId] = useState<string | null>(initialSelected);

  useEffect(() => {
    setSelectedId(
      currentOverrideId ??
        sorted.find((o) => o.isPreferred)?.id ??
        sorted[0]?.id ??
        null,
    );
  }, [currentOverrideId, sorted]);

  if (options.length === 0) {
    return (
      <div
        role="region"
        aria-label={ariaLabel}
        className={cn('rounded-md border border-border bg-surface p-4 text-sm text-mute', className)}
        style={{ borderWidth: '1px', borderStyle: 'solid' }}
      >
        {emptyStateCopy}
      </div>
    );
  }

  const isOverrideActive = selectedId !== null && !sorted.find((o) => o.id === selectedId)?.isPreferred;

  return (
    <div
      className={cn('rounded-md border border-border bg-surface p-4', className)}
      style={{ borderWidth: '1px', borderStyle: 'solid' }}
    >
      <div role="radiogroup" aria-label={ariaLabel} className="space-y-2">
        {sorted.map((opt) => {
          const id = `${groupId}-${opt.id}`;
          const checked = selectedId === opt.id;
          return (
            <label
              key={opt.id}
              htmlFor={id}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2',
                checked ? 'border-accent bg-accent-soft' : 'border-border hover:bg-surface-2',
              )}
              style={{ borderWidth: '1px', borderStyle: 'solid' }}
            >
              <input
                id={id}
                type="radio"
                role="radio"
                name={groupId}
                value={opt.id}
                aria-checked={checked}
                checked={checked}
                onChange={() => setSelectedId(opt.id)}
                className="h-4 w-4 text-accent"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-ink">{opt.supplierName}</span>
                  {opt.isPreferred && (
                    <span
                      className="inline-flex items-center gap-1 rounded-pill bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent"
                      aria-label="Preferred supplier"
                    >
                      <Check aria-hidden="true" size={12} />
                      Preferred
                    </span>
                  )}
                </div>
                {opt.packLabel && (
                  <div className="text-xs text-mute">{opt.packLabel}</div>
                )}
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold tabular-nums text-ink">
                  {formatCurrency(opt.price, opt.currency, locale)}
                </div>
              </div>
            </label>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className={cn(
            'rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-fg',
            'hover:bg-accent-press disabled:cursor-not-allowed disabled:opacity-50',
          )}
          style={{ minHeight: 'var(--touch-target-min)' }}
          disabled={selectedId === null}
          onClick={() => selectedId && onApply({ supplierItemId: selectedId })}
        >
          Apply
        </button>
        <button
          type="button"
          className={cn(
            'rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink',
            'hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50',
          )}
          style={{ minHeight: 'var(--touch-target-min)', borderWidth: '1px', borderStyle: 'solid' }}
          disabled={!isOverrideActive}
          onClick={onClear}
        >
          Use preferred
        </button>
      </div>
    </div>
  );
}

function sortOptions(options: SupplierItemOption[]): SupplierItemOption[] {
  return [...options].sort((a, b) => {
    if (a.isPreferred && !b.isPreferred) return -1;
    if (!a.isPreferred && b.isPreferred) return 1;
    return a.price - b.price;
  });
}

function formatCurrency(value: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
