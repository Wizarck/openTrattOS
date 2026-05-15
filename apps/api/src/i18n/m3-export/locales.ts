/**
 * M3 APPCC export locales (per ADR-035).
 *
 * Four locales: es-ES (default), ca-ES, eu-ES, gl-ES. The four
 * autonomous-community languages plus Castellano as the universal
 * fallback. The bundle generator (slice #14, parallel sibling) consumes
 * `Locale` and `DEFAULT_LOCALE` through `TranslatorService`.
 *
 * Per ADR-035 the locale union is open-closed: adding a new locale
 * requires extending this tuple AND seeding the corresponding template
 * JSON file. There is no runtime locale registration.
 */
export type Locale = 'es-ES' | 'ca-ES' | 'eu-ES' | 'gl-ES';

export const DEFAULT_LOCALE: Locale = 'es-ES';

export const ALL_LOCALES: readonly Locale[] = [
  'es-ES',
  'ca-ES',
  'eu-ES',
  'gl-ES',
] as const;

export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === 'string' &&
    (ALL_LOCALES as readonly string[]).includes(value)
  );
}
