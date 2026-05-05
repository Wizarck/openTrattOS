/**
 * Driver abstraction for label print dispatch. Each printer family ships its
 * own adapter implementing this interface; the public REST endpoint
 * `POST /recipes/:id/print` is stable across adapter additions.
 *
 * Per ADR-019 + Gate D fork 4 (m2-labels-rendering): the abstraction is
 * shipped together with the renderer so apps/api/ depends on this package
 * for both PDF generation AND dispatch — keeping the adapter contract co-
 * located with the artefact format that flows through it.
 */

export type PrintPayloadKind = 'pdf' | 'zpl' | 'raw';

export interface PrintJobMeta {
  recipeId: string;
  organizationId: string;
  locale: string;
  /** Number of physical copies the printer should produce. Defaults to 1. */
  copies?: number;
  /** Page size requested by the org. Adapters can pre-flight-check support. */
  pageSize: 'a4' | 'thermal-4x6' | 'thermal-50x80';
  /**
   * Optional override for which configured printer to dispatch to (when an
   * org has multiple printers; out of scope for MVP — kept on the contract
   * for forward compatibility with `m2-labels-print-config-ui`).
   */
  printerId?: string;
}

export interface PrintJob {
  pdf?: Buffer;
  zpl?: string;
  raw?: Buffer;
  meta: PrintJobMeta;
}

export interface PrintErrorPayload {
  /** Stable error code, e.g. 'PRINTER_UNREACHABLE', 'AUTH_REJECTED', 'UNSUPPORTED_FORMAT'. */
  code: string;
  /** Human-readable message — surfaced to the chef as part of the 502 response. */
  message: string;
}

export interface PrintResult {
  ok: boolean;
  /** Adapter-assigned job identifier (when the adapter supports tracking). */
  jobId?: string;
  /** Populated when `ok === false`. */
  error?: PrintErrorPayload;
}

export interface PrintAdapter {
  /** Stable adapter discriminator — written into Org.labelFields.printAdapter.id. */
  readonly id: string;
  /** Payload kinds this adapter accepts. Used by the dispatcher to render the right format. */
  readonly accepts: readonly PrintPayloadKind[];
  /**
   * Dispatch a print job. The dispatcher constructs the `PrintJob` such that
   * the payload kind matches one of `accepts`; an adapter MAY return
   * `{ ok: false, error: { code: 'UNSUPPORTED_FORMAT', ... } }` defensively
   * if the dispatcher mismatches.
   */
  print(job: PrintJob): Promise<PrintResult>;
}
