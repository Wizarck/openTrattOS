import type { Locale } from '../locales';
import { ES_TEMPLATE } from './es';
import { CA_TEMPLATE } from './ca';
import { EU_TEMPLATE } from './eu';
import { GL_TEMPLATE } from './gl';

/**
 * Per-locale template registry. Keys are flat strings (no nested
 * objects) so the lookup is O(1) in `TranslatorService.translate`.
 *
 * Keep this in sync with the `Locale` union in `../locales.ts`.
 */
export const TEMPLATES: Readonly<Record<Locale, Readonly<Record<string, string>>>> = Object.freeze({
  'es-ES': ES_TEMPLATE,
  'ca-ES': CA_TEMPLATE,
  'eu-ES': EU_TEMPLATE,
  'gl-ES': GL_TEMPLATE,
});
