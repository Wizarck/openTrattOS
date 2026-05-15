/**
 * Slice-local contracts for m3-appcc-export-bundle-service.
 *
 * INLINE per the cross-slice contract pattern — NO `packages/contracts`
 * import. Slice #15 (m3-appcc-i18n-ui) defines its own UI-facing shapes
 * over the REST surface this slice publishes; the two halves meet at the
 * URL contract.
 */

/** Spain's autonomous-community locale codes per FR23 + ADR-035. */
export type Locale = 'es-ES' | 'ca-ES' | 'eu-ES' | 'gl-ES';
export const LOCALES: readonly Locale[] = ['es-ES', 'ca-ES', 'eu-ES', 'gl-ES'];

/**
 * Scope kinds correspond 1:1 to derivative chapters. Chapter 0 (raw
 * audit_log) is always present regardless of scope per FR25.
 */
export type ScopeKind = 'haccp' | 'lot' | 'procurement' | 'photo' | 'ai_obs';
export const SCOPE_KINDS: readonly ScopeKind[] = [
  'haccp',
  'lot',
  'procurement',
  'photo',
  'ai_obs',
];

/** Bundle lifecycle status; CHECK enforced at DB level. */
export type ExportBundleStatus =
  | 'pending'
  | 'generating'
  | 'ready'
  | 'failed'
  | 'archived';

/** Input shape for `BundleGeneratorService.generate()`. */
export interface GenerateBundleInput {
  readonly organizationId: string;
  readonly requestedByUserId: string;
  readonly actorKind: 'user' | 'agent';
  readonly rangeStart: Date;
  readonly rangeEnd: Date;
  readonly locale: Locale;
  readonly scope: ReadonlyArray<ScopeKind>;
  readonly recipientEmails?: ReadonlyArray<string>;
  /** Optional Manager scope restriction; filters derivative chapters. */
  readonly locationIds?: ReadonlyArray<string>;
}

/** Per-chapter renderer output. Each section is concatenated by the generator. */
export interface ChapterSection {
  readonly pdfSection: Buffer;
  readonly csvSection: string;
  /** Number of source rows summarised in this chapter (for `page_count`). */
  readonly rowCount: number;
}

/** Per-recipient delivery outcome (mirrors slice #13 DispatchRecipient). */
export interface RecipientReceipt {
  readonly address: string;
  readonly status: 'delivered' | 'failed';
  readonly providerMessageId: string | null;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly attempt: number;
  readonly deliveredAt: string | null;
}

/** Row shape returned by `BundleArchiveQuery.recentBundles()`. */
export interface BundleArchiveRow {
  readonly id: string;
  readonly rangeStart: string;
  readonly rangeEnd: string;
  readonly locale: Locale;
  readonly scope: ReadonlyArray<ScopeKind>;
  readonly status: ExportBundleStatus;
  readonly sha256: string | null;
  readonly pageCount: number | null;
  readonly byteSize: number | null;
  readonly generatedAt: string | null;
  readonly requestedByUserId: string;
  readonly createdAt: string;
}

/** Detail view returned by `BundleStatusQuery.getBundleStatus()`. */
export interface BundleStatusView {
  readonly id: string;
  readonly status: ExportBundleStatus;
  readonly sha256: string | null;
  readonly pageCount: number | null;
  readonly byteSize: number | null;
  readonly generatedAt: string | null;
  readonly errorMessage: string | null;
  readonly pdfDownloadUrl: string | null;
  readonly csvDownloadUrl: string | null;
  readonly recipientReceipts: ReadonlyArray<RecipientReceipt>;
  readonly locale: Locale;
  readonly scope: ReadonlyArray<ScopeKind>;
  readonly rangeStart: string;
  readonly rangeEnd: string;
}

/**
 * Payload-after shape for `EXPORT_BUNDLE_GENERATED`. The same field set
 * is mirrored on `export_bundles` (operational projection) — both equal
 * by construction. `bundle_sha256` is the verbatim sealed hash.
 */
export interface ExportBundleGeneratedPayload {
  readonly bundle_sha256: string;
  readonly pdf_storage_path: string;
  readonly csv_storage_path: string;
  readonly locale: Locale;
  readonly scope: ReadonlyArray<ScopeKind>;
  readonly range_start: string;
  readonly range_end: string;
  readonly page_count: number;
  readonly byte_size: number;
}

/** Payload-after for `EXPORT_BUNDLE_DISPATCHED` (per-recipient). */
export interface ExportBundleDispatchedPayload {
  readonly recipient: string;
  readonly deliveryStatus: 'delivered' | 'failed';
  readonly providerMessageId: string | null;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly attempt: number;
  readonly dispatchedAt: string;
  readonly bundle_sha256: string;
}

/** Canonical aggregate_type for compliance-export envelopes. */
export const COMPLIANCE_EXPORT_AGGREGATE_TYPE = 'compliance_export' as const;

/** Email tag passed to EmailDispatchService.dispatch(). */
export const COMPLIANCE_EXPORT_EMAIL_TAG = 'm3.compliance.export_dispatch' as const;

/** Synchronous-generation threshold per j9.md §Notes for implementation. */
export const SYNC_GENERATION_MAX_DAYS = 90;

/** Canonical chapter order; renderers iterate in this sequence. */
export const CANONICAL_CHAPTER_ORDER: readonly ScopeKind[] = [
  'haccp',
  'lot',
  'procurement',
  'photo',
  'ai_obs',
];
