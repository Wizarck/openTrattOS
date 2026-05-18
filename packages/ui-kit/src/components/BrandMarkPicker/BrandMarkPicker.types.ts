/**
 * Presentational component — the consumer owns the upload mutation and
 * threads progress + result + errors back via props. Mirrors the shape
 * `apps/api/src/brand-assets` exposes via POST /api/organizations/:id/brand-mark.
 */

export interface BrandMarkPickerProps {
  /** Current logo URL (uploaded asset or external). Empty/undefined = no logo set. */
  value?: string;
  /** Fired when the user drops a file OR clicks the dropzone and picks one. */
  onFilePicked: (file: File) => void;
  /**
   * Fired when the user edits the external-URL fallback input directly
   * (without uploading). Pass empty string to clear; the consumer should
   * persist `undefined` in that case.
   */
  onUrlChanged: (url: string | undefined) => void;
  /** Fired when the user clicks "Quitar". */
  onClear: () => void;
  /** True while an upload is in flight — disables the dropzone + shows spinner. */
  uploading?: boolean;
  /** Surface a server / client error inline below the dropzone. */
  error?: string;
  /** Optional success message (e.g. "Subido — 200×80 PNG, 4 KB"). */
  successInfo?: string;
  /** Render-only mode — hides the dropzone + URL input. */
  disabled?: boolean;
}

/** MIME types accepted by the backend `BrandAssetProcessor`. Mirror constant. */
export const ACCEPTED_BRAND_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
] as const;

/** Max upload size enforced by the backend. Mirror constant. */
export const MAX_BRAND_BYTES = 2 * 1024 * 1024;
