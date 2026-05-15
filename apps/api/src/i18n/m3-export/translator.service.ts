import { Injectable, Logger } from '@nestjs/common';
import { DEFAULT_LOCALE, type Locale } from './locales';
import { TEMPLATES } from './templates';

/**
 * Inputs accepted as ICU MessageFormat `{var}` substitution values.
 * Numbers + booleans are coerced via `String()`. `null` / `undefined`
 * are rendered as empty strings (defensive — partial vars should not
 * crash the bundle generator).
 */
export type TranslatorVar = string | number | boolean | null | undefined;

/**
 * M3 APPCC export translator (per ADR-035 + slice #15 m3-appcc-i18n-ui).
 *
 * Resolves a flat key against the four locale templates (es-ES, ca-ES,
 * eu-ES, gl-ES) with the contractual fallback chain:
 *
 *   1. lookup in `locale` template → if found, format with vars + return.
 *   2. else lookup in `es-ES` (the default locale) → if found, format +
 *      return; emit `Logger.warn` indicating the fallback (NFR-OBS-1 —
 *      full OTel span integration is deferred per slice #15 design).
 *   3. else return the key wrapped in guillemets (`«key»`) + emit
 *      `Logger.warn` indicating the missing-everywhere state.
 *
 * The wrapped-key sentinel is the inspector-visible clue that something
 * is unseeded — better than empty strings or English placeholders. Slice
 * #14's bundle generator consumes this service to render every
 * locale-bound string in the PDF + CSV companion.
 */
@Injectable()
export class TranslatorService {
  private readonly logger = new Logger(TranslatorService.name);

  translate(
    key: string,
    locale: Locale,
    vars: Readonly<Record<string, TranslatorVar>> = {},
  ): string {
    const template = TEMPLATES[locale]?.[key];
    if (template != null) {
      return formatIcu(template, vars);
    }

    const fallbackTemplate = TEMPLATES[DEFAULT_LOCALE]?.[key];
    if (fallbackTemplate != null) {
      this.logger.warn(
        `i18n.m3-export fallback: key="${key}" requested="${locale}" → "${DEFAULT_LOCALE}"`,
      );
      return formatIcu(fallbackTemplate, vars);
    }

    this.logger.warn(
      `i18n.m3-export missing: key="${key}" not found in any locale (requested="${locale}")`,
    );
    return `«${key}»`;
  }

  /**
   * Returns true when `key` is seeded in the requested locale. Used by
   * the bundle generator to detect partial-seed states (e.g. surface a
   * mute eyebrow "Algunas etiquetas no disponibles en euskara"); does
   * NOT trigger fallback or warnings.
   */
  has(key: string, locale: Locale): boolean {
    return TEMPLATES[locale]?.[key] != null;
  }
}

/**
 * Minimal ICU MessageFormat formatter — supports the `{var}` named
 * placeholder syntax used by every key in this slice's template seed.
 * Plural / select / number formatters are out of scope for v1 (slice
 * #14's templates do not use them); the formatter can be swapped for
 * `@formatjs/intl-messageformat` if richer features are needed.
 */
function formatIcu(
  template: string,
  vars: Readonly<Record<string, TranslatorVar>>,
): string {
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const v = vars[name];
    if (v == null) return '';
    return String(v);
  });
}
