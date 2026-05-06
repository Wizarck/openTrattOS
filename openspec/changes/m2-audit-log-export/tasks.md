## 1. CSV serialiser (pure)

- [ ] 1.1 Create `apps/api/src/audit-log/application/audit-log-csv.ts`:
  - `escapeCsvField(value: string | null | undefined): string` — RFC 4180. Empty string for `null` / `undefined`. Wrap in `"…"` if value contains `,` / `"` / `\n` / `\r`; double internal `"`.
  - `csvHeaderRow(): string` — fixed 14-column header in this order: `id,organizationId,eventType,aggregateType,aggregateId,actorUserId,actorKind,agentName,payloadBeforeJson,payloadAfterJson,reason,citationUrl,snippet,createdAt`.
  - `csvSerialiseRow(row: AuditLog): string` — 14 columns; jsonb columns via `JSON.stringify(payload)` (or empty string when null); `createdAt` as `row.createdAt.toISOString()`.

## 2. Service streaming

- [ ] 2.1 In `apps/api/src/audit-log/application/audit-log.service.ts`:
  - Export constant `AUDIT_LOG_EXPORT_HARD_CAP = 100_000`.
  - Public method `streamRows(filter: AuditLogFilter, hardCap: number = AUDIT_LOG_EXPORT_HARD_CAP): AsyncGenerator<AuditLog>` — cursor-paginated; batches of 1000; respects all existing filter fields (q, aggregateType, aggregateId, eventTypes, actorUserId, actorKind, since, until); ignores limit/offset.
  - Private method `cursorBatch(filter, cursor, limit)` returning `AuditLog[]` ordered by `(created_at DESC, id DESC)`. When cursor is non-undefined: `WHERE (a.created_at, a.id) < (:cursorCreatedAt, :cursorId)`. Reuses the FTS clause-builder from Wave 1.11 when `q` is set.
- [ ] 2.2 Hard-cap behaviour: when the loop yields exactly `hardCap` rows, `streamRows()` returns AT THAT POINT (does not query the next batch). The caller signals "truncated" by comparing `emittedCount` to `hardCap`.

## 3. Controller

- [ ] 3.1 In `apps/api/src/audit-log/interface/audit-log.controller.ts`:
  - New `@Get('export.csv')` method, `@Roles('OWNER', 'MANAGER')`.
  - Reuses `AuditLogQueryDto` (limit/offset accepted-but-ignored).
  - Builds an async generator that yields header + each `csvSerialiseRow(row) + '\n'` from the service.
  - Wraps the generator in `Readable.from(...)` and returns `new StreamableFile(stream)`.
  - Sets headers via the injected `@Res({ passthrough: true })`:
    - `Content-Type: text/csv; charset=utf-8`
    - `Content-Disposition: attachment; filename="audit-log-YYYY-MM-DD.csv"` where the date is `new Date().toISOString().slice(0, 10)`.
    - When the stream emitted exactly `AUDIT_LOG_EXPORT_HARD_CAP` rows: `X-Audit-Log-Export-Truncated: true`. Otherwise the header is omitted.
- [ ] 3.2 Truncation header is set BEFORE the response body starts, via a pre-flight check. HTTP streaming responses can't add headers after the first byte is written, so the controller calls a new service method `wouldExceedCap(filter, cap): Promise<boolean>` BEFORE constructing the StreamableFile. That method runs `SELECT count(*) FROM (SELECT 1 FROM audit_log a WHERE … LIMIT cap+1) sub` — capped subquery so the count is bounded at cap+1 even on tables with millions of rows. If the result equals cap+1, the result set exceeds the cap; the controller sets `X-Audit-Log-Export-Truncated: true` and the generator stops at exactly `cap` rows. Cost: one extra ~10–50ms count query per export, acceptable for a compliance dump.

## 4. Tests

- [ ] 4.1 Unit `audit-log-csv.spec.ts`:
  - `escapeCsvField('')` → `''`.
  - `escapeCsvField(null)` → `''`.
  - `escapeCsvField('foo')` → `'foo'`.
  - `escapeCsvField('foo,bar')` → `'"foo,bar"'`.
  - `escapeCsvField('he said "hi"')` → `'"he said ""hi"""'`.
  - `escapeCsvField('line1\nline2')` → `'"line1\nline2"'`.
  - `csvHeaderRow()` → exact 14-column header string.
  - `csvSerialiseRow(row)` for a representative row asserts comma count = 13 (= 14 fields), correct field order, ISO date, jsonb stringified.
  - `csvSerialiseRow(row)` with `null` jsonb columns → empty cells.
  - `csvSerialiseRow(row)` with payload containing comma+quote+newline → fully quoted with internal `""` escaping.
- [ ] 4.2 Unit `audit-log.service.spec.ts` extension — `streamRows()`:
  - Empty result set → generator yields zero rows + returns immediately.
  - 50-row result, hardCap=200 → all 50 yielded, no extra batches.
  - 2500-row result (mocked across 3 batches), hardCap=10000 → all 2500 yielded.
  - 2500-row result, hardCap=1500 → exactly 1500 yielded.
  - Cursor advance verified: each subsequent `cursorBatch` call receives the previous batch's last (createdAt, id).
- [ ] 4.3 Controller test — pass-through to service:
  - GET `/audit-log/export.csv` returns `Content-Type: text/csv; charset=utf-8`.
  - Filename includes today's UTC date in `YYYY-MM-DD` format.
  - Owner/Manager allowed; Staff returns 403.
  - The generator-to-stream wiring emits header + N data rows.
- [ ] 4.4 INT spec `audit-log-export.int.spec.ts`:
  - Seed 105 audit rows.
  - With low cap (10), export → 10 data rows + truncation indicator detectable.
  - With high cap (1000), export → 105 data rows + no truncation.
  - With `q='tomate'` filter on a subset → only matching rows in CSV.
  - Parse the CSV output via a tiny inline parser (split on `\n`, RFC 4180 unquote) and assert each row's id back-matches a seed UUID.
  - Assert `payloadAfterJson` column round-trips via `JSON.parse` for a row whose seed payload contained quotes + commas + newlines.

## 5. Verification

- [ ] 5.1 `openspec validate m2-audit-log-export` passes (when CLI present; trust convention otherwise).
- [ ] 5.2 `npx jest --runInBand` (apps/api) — full suite green; ≥10 net new unit tests + 4 INT scenarios.
- [ ] 5.3 Lint clean across workspaces.
- [ ] 5.4 Build green.

## 6. CI + landing

- [ ] 6.1 Implementation pushed; CI green.
- [ ] 6.2 Admin-merge once required checks pass.
- [ ] 6.3 Archive `openspec/changes/m2-audit-log-export/` → `openspec/specs/m2-audit-log-export/`.
- [ ] 6.4 Write `retros/m2-audit-log-export.md`.
- [ ] 6.5 Update auto-memory `project_m1_state.md` — Wave 1.12 closed.
- [ ] 6.6 File follow-ups (only those still warranted post-merge):
  - `m2-audit-log-export-async` — async job pattern at hour-scale.
  - `m2-audit-log-export-multi-format` — JSONL / Parquet / NDJSON.
  - `m2-audit-log-export-columns` — `?columns=foo,bar` configurability.
  - `m2-audit-log-export-row-cap` — per-row truncation when payloads exceed e.g. 32KB.
  - `m2-audit-log-export-compliance-role` — separate `audit_export` capability if enterprise customer asks.
