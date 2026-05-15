export interface BundleArchiveRow {
  bundleId: string;
  /** ISO timestamp of generation. */
  generatedAt: string;
  /** Pre-formatted range label (e.g. "12 feb - 13 may 2026"). */
  rangeLabel: string;
  /** Locale tag (e.g. "es-ES"). */
  locale: string;
  /** Pre-formatted scope summary (e.g. "HACCP + Lot"). */
  scopeLabel: string;
  /** Display name of the actor who generated the bundle. */
  generatedByActor: string;
  /** SHA-256 short form (e.g. "a9f3…b274"). */
  sha256Short: string;
  /**
   * `true` when the bundle has been moved to cold storage by the
   * retention archival worker (per ADR-029). Cold-storage rows render a
   * `restaurar →` link (inert in this slice).
   */
  archived: boolean;
}

export interface BundleArchiveTableProps {
  rows: ReadonlyArray<BundleArchiveRow>;
  /** Max rows to render (defaults to 10 per slice #14's API cap). */
  limit?: number;
  /** Download click handler (inert for archived rows in v1). */
  onDownload: (bundleId: string) => void;
  /** Restore click handler (inert in v1; renders the link but is a no-op). */
  onRestore?: (bundleId: string) => void;
  className?: string;
}
