export type LabelPreviewLocale = 'es' | 'en' | 'it';

export const LABEL_PREVIEW_LOCALES: readonly LabelPreviewLocale[] = ['es', 'en', 'it'] as const;

/** Structured error returned by the renderer when Article 9 fields are missing. */
export interface LabelMissingFieldsError {
  code: 'MISSING_MANDATORY_FIELDS';
  missing: string[];
}

export interface LabelUnsupportedLocaleError {
  code: 'UNSUPPORTED_LOCALE';
  locale: string;
  supported: readonly string[];
}

export interface LabelPrintAdapterNotConfiguredError {
  code: 'PRINT_ADAPTER_NOT_CONFIGURED';
}

export interface LabelGenericApiError {
  code: string;
  [key: string]: unknown;
}

export type LabelApiError =
  | LabelMissingFieldsError
  | LabelUnsupportedLocaleError
  | LabelPrintAdapterNotConfiguredError
  | LabelGenericApiError;

export interface LabelPreviewProps {
  /** Recipe id whose label should render. */
  recipeId: string;
  /** Currently selected locale. */
  locale: LabelPreviewLocale;
  /** Callback when the user changes the locale dropdown. */
  onLocaleChange: (locale: LabelPreviewLocale) => void;
  /**
   * URL of the streaming PDF endpoint. Wired by the consuming hook so the
   * component stays presentation-only.
   */
  previewUrl: string;
  /**
   * Triggered when the user clicks "Print" — the consumer kicks off the
   * mutation. Component does not show a confirm step itself; the parent
   * controls the 3-click flow ("Open" → "Print" → "Confirm").
   */
  onPrint: () => void;
  /** Triggered when the user clicks "Download" — opens the PDF in a new tab. */
  onDownload: () => void;
  /** Optional missing-fields / unsupported-locale / adapter error state. */
  error?: LabelApiError | null;
  /** True while the render request is in-flight (preview iframe not yet loaded). */
  loading?: boolean;
  /** True while the print mutation is in-flight. */
  printing?: boolean;
  /** Print success state for inline confirmation feedback. */
  printSuccessJobId?: string | null;
  className?: string;
}
