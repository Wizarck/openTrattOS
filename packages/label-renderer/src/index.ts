// Public entrypoint — re-exports the stable surface of @opentrattos/label-renderer.

export type {
  LabelLocale,
  LabelPageSize,
  LabelPostalAddress,
  LabelContactInfo,
  LabelOrg,
  LabelIngredientRow,
  LabelMacros,
  LabelCrossContamination,
  LabelRecipe,
  LabelData,
} from './types';
export { SUPPORTED_LOCALES, SUPPORTED_PAGE_SIZES } from './types';

export { LOCALE_STRINGS, localizeAllergen } from './locales';
export type { LabelStrings } from './locales';

export { PAGE_GEOMETRY } from './page-sizes';
export type { PageGeometry } from './page-sizes';

export { LabelDocument } from './components/LabelDocument';
export { renderLabelToPdf } from './render';

// Print abstraction
export type {
  PrintAdapter,
  PrintJob,
  PrintJobMeta,
  PrintPayloadKind,
  PrintResult,
  PrintErrorPayload,
} from './print/adapter';
export { PrintAdapterRegistry } from './print/registry';
export { IppPrintAdapter } from './print/ipp-adapter';
export type { IppAdapterConfig } from './print/ipp-adapter';
