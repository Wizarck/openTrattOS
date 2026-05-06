## ADDED Requirements

### Requirement: `GET /audit-log/export.csv` streams audit_log as CSV

A new endpoint `GET /audit-log/export.csv` SHALL accept the same filter shape as `GET /audit-log` (organizationId required; aggregateType, aggregateId, eventType, actorUserId, actorKind, since, until, q optional) and return the matching rows as a streamed `text/csv; charset=utf-8` response with `Content-Disposition: attachment; filename="audit-log-YYYY-MM-DD.csv"` (UTC date-of-export). The `limit` and `offset` parameters SHALL be accepted (DTO-level) but ignored at the service layer; pagination is internal to the stream.

#### Scenario: happy-path export under cap

- **WHEN** an Owner calls `GET /audit-log/export.csv?organizationId=…` against a table containing 50 rows that match the filter
- **THEN** the response is HTTP 200 with `Content-Type: text/csv; charset=utf-8`, `Content-Disposition` filename = `audit-log-<today-utc-date>.csv`, body = 1 header row + 50 data rows, no `X-Audit-Log-Export-Truncated` header

#### Scenario: empty result set

- **WHEN** filters narrow the result to zero rows
- **THEN** the response body contains exactly the header row (14 columns), no `X-Audit-Log-Export-Truncated` header

### Requirement: streamed export caps at 100 000 rows and signals truncation

The service SHALL stop emitting rows after `AUDIT_LOG_EXPORT_HARD_CAP = 100000` rows, and the response SHALL carry an `X-Audit-Log-Export-Truncated: true` header when truncation occurs.

#### Scenario: result set exceeds the hard cap

- **WHEN** the matching result set has 105 rows AND the test instance is configured with `AUDIT_LOG_EXPORT_HARD_CAP = 100`
- **THEN** the response body contains the header row + exactly 100 data rows AND the `X-Audit-Log-Export-Truncated: true` header is set; the operator runbook directs them to narrow the date window and re-run

#### Scenario: result set is exactly at the cap

- **WHEN** the matching result set has exactly `AUDIT_LOG_EXPORT_HARD_CAP` rows
- **THEN** the response body contains the header + that many data rows; the truncation header is set ONLY if the underlying source contains MORE than the cap (no false positive when the cap is exactly hit but no further rows exist)

### Requirement: CSV format follows RFC 4180 with 14 stable columns

The CSV output SHALL begin with a header row `id,organizationId,eventType,aggregateType,aggregateId,actorUserId,actorKind,agentName,payloadBeforeJson,payloadAfterJson,reason,citationUrl,snippet,createdAt`. Each data row SHALL have exactly 14 fields in that order. Fields containing comma, double quote, carriage return, or newline SHALL be wrapped in double quotes, with embedded double quotes doubled (`"` → `""`). `null`/`undefined` field values SHALL serialise as empty cells (no literal `null`). `payload_before` / `payload_after` SHALL be rendered as `JSON.stringify(value)` (or empty cell if null). `created_at` SHALL be ISO-8601 UTC (`YYYY-MM-DDTHH:mm:ss.sssZ`).

#### Scenario: row with embedded comma + quote + newline round-trips

- **WHEN** a seeded audit_log row's `reason` contains `'he said "ok, then\nhi"'` AND that row is exported
- **THEN** the CSV cell for `reason` is `"he said ""ok, then\nhi"""` (ten characters of payload + RFC 4180 escapes), and parsing the output via a standard CSV parser recovers the original string exactly

#### Scenario: null jsonb payloads serialise as empty cells

- **WHEN** an exported row has `payload_before = null` and `payload_after = null`
- **THEN** the corresponding CSV cells are empty (i.e. `,,` between adjacent commas), not the string `null`

#### Scenario: jsonb payloads stringify to JSON text

- **WHEN** an exported row has `payload_after = { totalCost: 12.34, components: [{ id: 'x' }] }`
- **THEN** the `payloadAfterJson` cell contains `"{""totalCost"":12.34,""components"":[{""id"":""x""}]}"` (RFC 4180-quoted with internal quote doubling)

### Requirement: export is restricted to Owner + Manager

The endpoint SHALL be guarded by `@Roles('OWNER', 'MANAGER')` — Staff role SHALL receive HTTP 403.

#### Scenario: Staff role denied

- **WHEN** a user with Staff role calls `GET /audit-log/export.csv?organizationId=…`
- **THEN** the response is HTTP 403 with no CSV body

#### Scenario: Manager role allowed

- **WHEN** a user with Manager role calls the endpoint
- **THEN** the response is HTTP 200 with the CSV stream

### Requirement: filter `q` (FTS) is honoured during export

When the `q` query parameter is set, the export SHALL include only rows matching the dual-config FTS predicate from `m2-audit-log-fts`. Ordering SHALL be `created_at DESC, id DESC` regardless of `q` (export ordering is stable for compliance reproducibility — relevance ranking is for interactive use only).

#### Scenario: q narrows the export

- **WHEN** an Owner calls `GET /audit-log/export.csv?organizationId=…&q=tomate` against a table with 50 rows total, of which 6 match the FTS predicate
- **THEN** the response body contains the header + 6 data rows; the rows are ordered by `created_at DESC` (NOT by ts_rank)
