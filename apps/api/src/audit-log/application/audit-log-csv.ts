import type { AuditLog } from '../domain/audit-log.entity';

/**
 * M2 Wave 1.12 — m2-audit-log-export: pure CSV serialiser for `audit_log` rows.
 *
 * Format: RFC 4180. Fields containing comma, double quote, CR, or LF are
 * wrapped in double quotes; embedded double quotes are doubled (`"` → `""`).
 * `null` / `undefined` field values render as empty cells (NOT the literal
 * string `null`). `payload_before` / `payload_after` (jsonb) are rendered as
 * `JSON.stringify(value)` — schema-stable across the open `event_type` set.
 * `created_at` is ISO-8601 UTC.
 *
 * Column order is fixed and stable — compliance dumps must be reproducible.
 */

export const AUDIT_LOG_CSV_HEADER = [
  'id',
  'organizationId',
  'eventType',
  'aggregateType',
  'aggregateId',
  'actorUserId',
  'actorKind',
  'agentName',
  'payloadBeforeJson',
  'payloadAfterJson',
  'reason',
  'citationUrl',
  'snippet',
  'createdAt',
] as const;

const ESCAPE_NEEDED = /[",\r\n]/;

export function escapeCsvField(value: string | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (!ESCAPE_NEEDED.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

export function csvHeaderRow(): string {
  return AUDIT_LOG_CSV_HEADER.join(',');
}

export function csvSerialiseRow(row: AuditLog): string {
  const fields: Array<string | null | undefined> = [
    row.id,
    row.organizationId,
    row.eventType,
    row.aggregateType,
    row.aggregateId,
    row.actorUserId,
    row.actorKind,
    row.agentName,
    row.payloadBefore == null ? null : JSON.stringify(row.payloadBefore),
    row.payloadAfter == null ? null : JSON.stringify(row.payloadAfter),
    row.reason,
    row.citationUrl,
    row.snippet,
    row.createdAt.toISOString(),
  ];
  return fields.map(escapeCsvField).join(',');
}
