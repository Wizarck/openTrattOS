import { Module } from '@nestjs/common';
import { TranslatorService } from './translator.service';

/**
 * M3 APPCC export i18n module (slice #15 m3-appcc-i18n-ui, Wave 2.7).
 *
 * Per ADR-035 this module ships the four-locale ICU MessageFormat
 * template seed (es-ES default + ca-ES + eu-ES + gl-ES), the EU 1169
 * Annex II allergen vocabulary lookup table (14 codes × 4 locales), and
 * the `TranslatorService` with the contractual `locale → es-ES →
 * «key»` fallback chain.
 *
 * Slice #14 (`m3-appcc-export-bundle-service`, parallel sibling) consumes
 * `TranslatorService` to render every locale-bound string in the PDF
 * cover page + chapter headers + table headers + signature block. The
 * frontend slice #15 surface (`AppccExportScreen`) does NOT consume
 * this module — the j9 mock is operator-facing (Spanish-only) and the
 * locale selection is sent to the backend on bundle generation.
 */
@Module({
  providers: [TranslatorService],
  exports: [TranslatorService],
})
export class I18nM3ExportModule {}
