export interface BundleDownloadSummary {
  bundleId: string;
  /** SHA-256 short form for display (e.g. "a9f3…b274"). */
  sha256: string;
  /** Anchor audit_log entry id (e.g. "AL-2026-189554"). */
  auditLogId: string;
  /** ISO timestamp of bundle generation (rendered as HH:MM CEST). */
  generatedAt: string;
  /** Locale of the bundle (rendered in PDF label). */
  locale: string;
  /** Bundle PDF size in bytes (for the button label). */
  pdfSizeBytes: number;
  /** Bundle PDF page count (for the button label). */
  pdfPageCount: number;
  /** CSV companion size in bytes (for the button label). */
  csvSizeBytes: number;
}

export interface BundleDownloadRowProps {
  bundle: BundleDownloadSummary;
  /** Number of recipients the bundle was dispatched to (0 if none). */
  dispatchedRecipients: number;
  onDownloadPdf: () => void;
  onDownloadCsv: () => void;
  className?: string;
}
