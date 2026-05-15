import { cn } from '../../lib/cn';
import type {
  Locale,
  LocaleChipGroupProps,
  LocaleOption,
} from './LocaleChipGroup.types';

/**
 * j9 region #3 — locale picker (slice #15 m3-appcc-i18n-ui).
 *
 * Four chips, single-select, with visual permanence per ADR-J9-LOCALE-
 * CHIPS-NOT-DROPDOWN: the autonomous-community context means the
 * operator may need to glance at the chosen locale while configuring
 * the rest of the form. A dropdown would hide the choice the moment it
 * closes; the chip stays visible.
 *
 * Selection swaps the active chip via `aria-pressed`. The chip group
 * is a `<div role="group">`; chips are `<button type="button">` for
 * keyboard activation.
 */
export const DEFAULT_LOCALE_OPTIONS: ReadonlyArray<LocaleOption> = [
  { value: 'es-ES', shortLabel: 'ES', longLabel: 'Castellano (es-ES)' },
  { value: 'ca-ES', shortLabel: 'CA', longLabel: 'Català (ca-ES)' },
  { value: 'eu-ES', shortLabel: 'EU', longLabel: 'Euskara (eu-ES)' },
  { value: 'gl-ES', shortLabel: 'GL', longLabel: 'Galego (gl-ES)' },
];

const FOOTER_TEXT =
  'La localización determina el idioma de los encabezados, etiquetas, y vocabulario de alérgenos.';

export function LocaleChipGroup({
  value,
  onChange,
  locales = DEFAULT_LOCALE_OPTIONS,
  className,
}: LocaleChipGroupProps) {
  return (
    <div className={cn('mt-2', className)}>
      <div
        role="group"
        aria-label="Idioma"
        className="flex flex-wrap gap-2"
        data-component="locale-chip-group"
      >
        {locales.map((opt) => {
          const selected = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(opt.value)}
              className="inline-flex min-h-9 items-center gap-2 rounded-full border px-3.5 py-1 text-sm"
              style={{
                backgroundColor: selected
                  ? 'var(--color-accent-soft)'
                  : 'transparent',
                borderColor: selected
                  ? 'var(--color-accent)'
                  : 'var(--color-border)',
                color: selected ? 'var(--color-ink)' : 'var(--color-mute)',
              }}
              data-locale={opt.value}
            >
              <span aria-hidden="true" style={{ fontWeight: 500 }}>
                {opt.shortLabel}
              </span>
              <span>{opt.longLabel}</span>
            </button>
          );
        })}
      </div>
      <p
        className="mt-2 text-xs"
        style={{ color: 'var(--color-mute)' }}
      >
        {FOOTER_TEXT}
      </p>
    </div>
  );
}

export type { Locale };
