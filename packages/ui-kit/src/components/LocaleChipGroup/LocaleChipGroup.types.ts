/**
 * Locale union for the M3 APPCC export trigger surface. Duplicated
 * here (not imported from `apps/api/src/i18n/m3-export/locales.ts`)
 * because `packages/ui-kit/` is frontend-only and must not depend on
 * the backend module. Keep these in sync manually; the four locales
 * are stable per ADR-035.
 */
export type Locale = 'es-ES' | 'ca-ES' | 'eu-ES' | 'gl-ES';

export interface LocaleOption {
  value: Locale;
  /** Two-letter chip prefix (e.g. "ES"). */
  shortLabel: string;
  /** Long-form chip label (e.g. "Castellano (es-ES)"). */
  longLabel: string;
}

export interface LocaleChipGroupProps {
  value: Locale;
  onChange: (locale: Locale) => void;
  /** Optional locale list override (defaults to all 4 canonical locales). */
  locales?: ReadonlyArray<LocaleOption>;
  className?: string;
}
