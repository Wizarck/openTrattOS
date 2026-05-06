## Why

`m2-audit-log` (Wave 1.9), `m2-audit-log-cost-history-merge` (Wave 1.10), and `m2-audit-log-fts` (Wave 1.11) gave operators a queryable, full-text-searchable audit log via `GET /audit-log`. But compliance officers (regulator audits, internal accounting reviews, customer-data-export demands under GDPR Article 15) need the raw rows in a portable, spreadsheet-friendly format — not 50 paginated JSON pages.

This slice adds a CSV export endpoint, scoped to the audit-log capability. Same RBAC (Owner + Manager), same filter shape, but the response is a streamed `text/csv` attachment. Streaming (not buffered) so a multi-million-row table doesn't OOM the API; cursor pagination (not OFFSET) so iteration cost stays O(log N) per batch; hard cap at 100K rows so a runaway export can't bring down the API node.

## What Changes

- **New endpoint** `GET /audit-log/export.csv` on the existing `AuditLogController` — accepts the same filter shape as `GET /audit-log` (organizationId required + aggregateType/aggregateId/eventType/actorUserId/actorKind/since/until/q optional). `limit` + `offset` are accepted but ignored (pagination is internal to the stream).
- **Streaming response** via NestJS `StreamableFile` backed by an `async generator` that internally cursor-paginates the audit_log table in batches of 1000 rows, yielding CSV-encoded lines as they arrive.
- **Hard cap** `AUDIT_LOG_EXPORT_HARD_CAP=100000` rows total — protects against runaway exports. When reached, the stream ends cleanly and the response carries a `X-Audit-Log-Export-Truncated: true` header so the client can detect the cap.
- **Filename** `audit-log-YYYY-MM-DD.csv` via `Content-Disposition: attachment` — UTC date-of-export. Predictable, no filter exfiltration.
- **CSV format**: 14 columns matching the audit_log table, with `payload_before` and `payload_after` rendered as STRINGIFIED JSON (one column each, RFC 4180-quoted). Operators parse with `jq` / Excel power-query / pandas as needed.
- **NEW**: `apps/api/src/audit-log/application/audit-log-csv.ts` — pure CSV serialiser (header row + row encode + RFC 4180 field escape).
- **NEW**: `AuditLogService.streamRows(filter, hardCap): AsyncGenerator<AuditLog>` — cursor-paginated iterator, internal to the service.

## Capabilities

### New Capabilities

- **`m2-audit-log-export`** — CSV streaming export of `audit_log` rows for compliance and offline analysis.

### Modified Capabilities

(none — `m2-audit-log` is unchanged; the export is a sibling endpoint on the same controller.)

## Impact

- **Prerequisites**: `m2-audit-log` (Wave 1.9, `1e420a6`) + `m2-audit-log-cost-history-merge` (Wave 1.10, `c43456d`) + `m2-audit-log-fts` (Wave 1.11, `e7e1fb1`) merged.
- **Code**:
  - `apps/api/src/audit-log/application/audit-log-csv.ts` — pure CSV serialiser (header + row encoder + RFC 4180 field escape).
  - `apps/api/src/audit-log/application/audit-log.service.ts` — new public `streamRows(filter, hardCap)` async generator + private `cursorBatch(filter, cursor, limit)`.
  - `apps/api/src/audit-log/interface/audit-log.controller.ts` — new `@Get('export.csv')` method returning `StreamableFile`.
  - No DTO changes — reuses `AuditLogQueryDto` (limit/offset accepted-but-ignored).
  - No migration — pure read-side feature.
  - No entity changes.
- **Tests**: ~10 unit tests (CSV serialiser escape edge cases + header + row shape; service streamRows cursor logic + hard cap; controller header/role wiring) + 1 INT spec covering end-to-end stream consumption with seed data + cap enforcement.
- **Performance**: streaming + cursor pagination → constant memory footprint regardless of result size. Per-batch cost: `O(log N)` index lookup on `(organization_id, created_at DESC)` (existing `ix_audit_log_aggregate`). 100K rows ≈ 100 batches × ~10ms ≈ 1s wall-clock for a full export.
- **Storage**: zero (no schema changes).
- **Locale**: CSV is locale-agnostic. Dates rendered as ISO-8601 UTC (`2026-05-06T11:42:08.000Z`). `,` is the field separator; quoted strings use `"` escaped as `""`.
- **Rollback**: revert the controller change; no data migration to undo.
- **Out of scope**:
  - **Async job pattern** (`POST /exports` → job_id → `GET /exports/:id`). Filed as `m2-audit-log-export-async` if streaming becomes inadequate at huge scales.
  - **JSONL / Parquet / NDJSON formats**. Filed as `m2-audit-log-export-multi-format` if compliance ever requires.
  - **Customisable column subsets** (`?columns=foo,bar`). Filed as `m2-audit-log-export-columns`.
  - **Email-based delivery** (export → email link). Out of scope.
  - **Per-org rate limiting**. Operator runbook documents the hard cap; rate-limit at WAF if abuse emerges.
