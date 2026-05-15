export class AuditLogQueryError extends Error {
  constructor(
    message: string,
    readonly code: 'INVALID_DATE_RANGE' | 'LIMIT_OUT_OF_RANGE' | 'OFFSET_NEGATIVE',
  ) {
    super(message);
    this.name = 'AuditLogQueryError';
  }
}

/**
 * Thrown by `AuditLogService.record()` when per-write hash chain validation
 * (ADR-HASH-CHAIN-VALIDATION-PER-WRITE) detects a mismatch between the stored
 * `row_hash` of a row in the 100-row lookback window and the value
 * recomputed from `(prev_hash, canonicaliseRow(row))`.
 *
 * Per ADR-HASH-CHAIN-RECOVERY the surface is fail-the-write: the API
 * returns HTTP 500, a structured log line `audit-log.chain-broken` is
 * emitted, and downstream ops alerts pick up the row id of the first
 * detected break (`firstBrokenRowId`) for forensic investigation.
 */
export class HashChainBrokenError extends Error {
  readonly name = 'HashChainBrokenError';
  constructor(
    readonly organizationId: string,
    readonly firstBrokenRowId: string,
  ) {
    super(
      `audit-log hash chain broken: organizationId=${organizationId} firstBrokenRowId=${firstBrokenRowId}`,
    );
  }
}

/**
 * Thrown by `AuditLogService.record()` when an inbound envelope carries an
 * `idempotencyKey` that matches an existing `audit_log` row for the same
 * `organizationId` written within the sliding 24-hour detection window.
 *
 * Per the m3.x-audit-log-idempotency-required-mode design picks:
 *  - Enforcement mode: REJECT + log on duplicate.
 *  - Detection: app-side SELECT scoped to `created_at > NOW() - INTERVAL
 *    '24 hours'` (no DB UNIQUE constraint; the window slides).
 *
 * `AuditLogSubscriber.handleRecordError` swallows this error regardless of
 * retention class — rejection is by design, not a regulatory loss.
 */
export class IdempotencyConflictError extends Error {
  readonly code = 'AUDIT_IDEMPOTENCY_CONFLICT';
  constructor(
    readonly existingId: string,
    readonly idempotencyKey: string,
    readonly organizationId: string,
  ) {
    super(
      `audit_log idempotency conflict: key=${idempotencyKey} org=${organizationId} matched_id=${existingId}`,
    );
    this.name = 'IdempotencyConflictError';
  }
}
