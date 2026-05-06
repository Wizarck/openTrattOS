## Context

Three slices have shaped `audit_log`:
- Wave 1.9 created the table + `GET /audit-log` paginated query.
- Wave 1.10 enriched `RECIPE_COST_REBUILT` payloads + dropped `recipe_cost_history`.
- Wave 1.11 added dual-config full-text search via `?q=`.

Wave 1.12 closes the audit-log sub-saga: a streaming CSV export for compliance, offline analysis, and GDPR Article 15 portability.

The pivotal architectural choice is **streaming vs buffered**. A buffered response would be ~50 LOC simpler but caps practical export size at ~50K rows (Node's default heap + a 14-column-wide row × tens of thousands = OOM risk). Streaming costs the complexity of an async generator + cursor pagination but caps memory at one batch (1K rows) regardless of total. For an audit log that grows monotonically, streaming is the only sustainable path.

## Goals / Non-Goals

**Goals:**
- Stream CSV with constant memory footprint, regardless of total row count.
- Same filter shape as `GET /audit-log` — operators don't learn a new query language.
- Hard cap at 100K rows per request so one bad query can't degrade the API.
- RFC 4180-compliant CSV that opens cleanly in Excel, LibreOffice, pandas, jq, awk.
- Stable column order across requests (compliance reproducibility).

**Non-Goals:**
- Async job pattern. (Filed as follow-up.)
- Multi-format support (JSONL / Parquet). Filed.
- Configurable column subsets. Filed.
- Custom delimiters / locale-specific number formatting. CSV is canonical RFC 4180.
- Per-row timestamps in non-UTC. ISO-8601 UTC always.

## Decisions

### ADR-EXP-ENDPOINT — `GET /audit-log/export.csv` sibling endpoint (F1=b)

Add `@Get('export.csv')` to `AuditLogController` — sibling to the existing `@Get()`.

```
GET /audit-log              → JSON page (filter + pagination)
GET /audit-log/export.csv   → CSV stream  (filter + hard cap)
```

Rationale:
- **Distinct URL declares format** — clients see the `.csv` extension and know what to expect; reverse-proxy logs distinguish exports from queries; CDN cache rules can target `*.csv` paths.
- **Rejected: `?format=csv` on the same endpoint.** Mixing JSON + CSV at one URL forces conditional `Content-Type` selection deep in the controller; complicates OpenAPI typing (the response shape is no longer mono-typed).
- **Rejected: async `POST /exports` job pattern.** Useful for hour-scale exports, but premature for our scale and adds a job-state table + worker process. File for future scale.

### ADR-EXP-STREAM — async generator + cursor pagination + StreamableFile (F2=a)

```ts
// AuditLogService
async *streamRows(filter: AuditLogFilter, hardCap: number): AsyncGenerator<AuditLog> {
  let cursor: { createdAt: Date; id: string } | undefined = undefined;
  let emitted = 0;
  const BATCH = 1000;

  while (emitted < hardCap) {
    const want = Math.min(BATCH, hardCap - emitted);
    const batch = await this.cursorBatch(filter, cursor, want);
    if (batch.length === 0) return;
    for (const row of batch) {
      yield row;
      emitted++;
      if (emitted >= hardCap) return;
    }
    const last = batch[batch.length - 1];
    cursor = { createdAt: last.createdAt, id: last.id };
  }
}
```

`cursorBatch` adds a `WHERE (created_at, id) < (cursor.createdAt, cursor.id)` predicate so each batch resumes after the previous batch's last row. Order is `(created_at DESC, id DESC)` — newest-first, stable, cursor-friendly. Backed by the existing `ix_audit_log_aggregate` index whose leading columns match.

The controller adapts the generator to a `Readable` stream:

```ts
const stream = Readable.from(
  (async function* () {
    yield csvHeaderRow() + '\n';
    for await (const row of svc.streamRows(filter, AUDIT_LOG_EXPORT_HARD_CAP)) {
      yield csvSerialiseRow(row) + '\n';
    }
  })()
);
return new StreamableFile(stream);
```

Rationale:
- **Async generator is the JS-native streaming primitive** — `Readable.from(asyncIterable)` does the back-pressure plumbing for free; no manual `_read()` implementation.
- **Cursor pagination over OFFSET** — OFFSET-based pagination at row N requires Postgres to skip N rows per batch (linear cost). Cursor lookups stay `O(log N)` via the index. At 100K rows the difference is dramatic.
- **Newest-first ordering** — same default as `GET /audit-log` without a `q`. Cross-endpoint consistency.
- **Hard cap inside the generator** — stopping condition is enforced at the source, not by the consumer; even if a buggy consumer doesn't close the stream, the generator stops emitting.

### ADR-EXP-CAP — `AUDIT_LOG_EXPORT_HARD_CAP=100000` (F6=b)

Hard cap of 100K rows per request. When the stream stops because of the cap (rather than because the result set was exhausted), the response is annotated with `X-Audit-Log-Export-Truncated: true`.

Rationale:
- **100K is generous** — for a heavy-org pace of ~500 audit rows/min/org × 60 × 24 × 30 ≈ 21.6M/month, 100K covers ~3.5 hours of activity (a typical compliance window: a single shift). For longer windows, the operator narrows by date range.
- **Header signal** — the operator's spreadsheet shows 100K rows; without the header they wouldn't know whether that's the actual total or a cap. With it, the runbook says "if `Truncated: true`, narrow the date window and re-run".
- **No 414 / 422 — the request is honoured up to the cap.** Better UX than rejecting the request outright; the operator gets the most-recent 100K rows AND the signal that there are more.

### ADR-EXP-FORMAT — RFC 4180 CSV with 14 columns + JSON-stringified jsonb (F3=c, F7=a)

```
id,organizationId,eventType,aggregateType,aggregateId,actorUserId,actorKind,agentName,payloadBeforeJson,payloadAfterJson,reason,citationUrl,snippet,createdAt
00000…,abc-…,RECIPE_COST_REBUILT,recipe,…,…,system,,,"{""totalCost"":12.34,""components"":[{…}]}",MANUAL_RECOMPUTE,,,2026-05-06T11:42:08.000Z
```

Rationale:
- **All 14 columns** (F7=a) — compliance dumps shouldn't be opinionated about which column is "internal". UUIDs may be needed for cross-referencing with other systems.
- **Stringified jsonb in two columns** (F3=c) — schema-stable across the open `event_type` set. Flattening (option a) would mean a different column shape per event_type, breaking spreadsheet pivot tables and forcing schema migration each time we add an event. Stringifying loses spreadsheet-friendliness for the jsonb fields, but `jq -r '.payloadAfterJson | fromjson | .totalCost'` recovers it for power users.
- **RFC 4180 escape**: fields containing `,`, `"`, `\n`, or `\r` are wrapped in `"`; embedded `"` is doubled (`"` → `""`). Newlines inside quoted fields are preserved as-is.
- **`createdAt` as ISO-8601 UTC** — `2026-05-06T11:42:08.000Z`. Locale-agnostic, sortable as text, parsed by every spreadsheet date-detection.
- **`payloadBeforeJson` / `payloadAfterJson` empty cell when null** — empty unquoted CSV field, not the literal string `null` (which would parse as text).

### ADR-EXP-AUTH — Owner + Manager (F4=a)

`@Roles('OWNER', 'MANAGER')` on the controller method. Same as `GET /audit-log`.

Rationale:
- **No new role** — adding a capability flag (e.g. `audit_export`) is scope creep without a documented use case.
- **Compliance officers operate via the Owner account in our customer base.** Enterprise-RBAC nuance is filed as `m2-audit-log-export-compliance-role` if a customer ever asks.

### ADR-EXP-FILENAME — `audit-log-YYYY-MM-DD.csv` UTC (F5=a)

```
Content-Disposition: attachment; filename="audit-log-2026-05-06.csv"
```

Rationale:
- **Date-of-export, not date-of-data** — the data window is encoded in the request's `since` / `until` filters; the filename is the operator's record of WHEN they exported, not WHAT.
- **No filter echo in the filename** — including filters (`audit-log-recipe-tomate-…csv`) would leak query content into the filename, which lands in download history, browser caches, and cloud-sync metadata. Bad for sensitive queries.
- **UTC** — same locale as `createdAt`. Avoids "the export is named the wrong day because the operator's tz is +12".

## Risks / Trade-offs

- **[Risk] Cursor jitter when rows have identical `created_at`.** Two rows inserted in the same millisecond would have the same `created_at`; the cursor `(created_at, id) < (last.created_at, last.id)` correctly orders them by id (UUIDs sort lexicographically), so deduplication is guaranteed. Verified by the INT spec.
- **[Risk] Long-running stream holds a Postgres connection.** A 100K-row export at ~10ms/batch × 100 batches = ~1s — well within typical connection-pool patience. **Mitigation**: each batch is its own short query (no `cursor_in_postgres`-style server-side cursor); the connection is released between batches by the pool.
- **[Risk] Client cancels mid-stream.** Node's `Readable` propagates the close upstream; the async generator's `for await` loop receives the abort and stops emitting. Postgres connection released by the pool. No leak.
- **[Risk] CSV injection** (`=cmd|…!A1`) when fields starting with `=`/`+`/`-`/`@` are interpreted as formulas by Excel. **Mitigation**: per RFC 4180 we don't pre-escape; the operator runs an audit dump in their compliance team's controlled environment, not a spreadsheet emailed to a customer. If we ever ship customer-facing exports we revisit with `'`-prefix sanitisation.
- **[Risk] Memory growth from very wide jsonb payloads.** A pathological audit row with a 100KB `payload_after` × 1000-row batch = 100MB transient before yield. **Mitigation**: realistic payloads are 3–5KB (per Wave 1.10 retro). If a customer ever ships 100KB+ payloads, file `m2-audit-log-export-row-cap` to truncate rendered jsonb at e.g. 32KB.
- **[Trade-off] No async job pattern.** Filed.
- **[Trade-off] No customisable columns.** Filed.

## Migration Plan

1. New file `apps/api/src/audit-log/application/audit-log-csv.ts`:
   - `csvHeaderRow(): string` — 14-column header.
   - `csvSerialiseRow(row: AuditLog): string` — encodes one row.
   - `escapeCsvField(value: string | null | undefined): string` — RFC 4180 rules.
2. Service additions:
   - `AuditLogService.streamRows(filter, hardCap): AsyncGenerator<AuditLog>` — cursor pagination + cap.
   - Private `cursorBatch(filter, cursor, limit): Promise<AuditLog[]>` — one batch query.
   - Export constant `AUDIT_LOG_EXPORT_HARD_CAP = 100_000`.
3. Controller additions:
   - `@Get('export.csv')` method on `AuditLogController` — Owner+Manager, builds the StreamableFile from the generator.
   - Response headers: `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="audit-log-YYYY-MM-DD.csv"`, conditional `X-Audit-Log-Export-Truncated: true`.
4. Tests:
   - Unit: CSV serialiser (escape rules, header shape, null handling, jsonb stringification, all 14 columns).
   - Unit: service streamRows cursor advance + hard cap (mock data source).
   - Controller: header wiring, RBAC.
   - INT spec (Postgres): seed 105 rows, export with `cap=100`, assert `Truncated` header + 100 data rows + parseable CSV.

**Rollback**: revert the controller method + delete the helper files. No DB changes.

## Open Questions

- **Should `q` (FTS) participate in the export?** Decision: yes. The export reuses the same filter shape; if the operator can search interactively, they can export the same filter. No new auth surface.
- **Should the stream emit a UTF-8 BOM (`﻿`) so Excel auto-detects encoding?** Decision: no. RFC 4180 says no BOM; modern Excel detects UTF-8 from the `charset=utf-8` Content-Type header. Operators on legacy Excel (≤2010) can pre-pend the BOM in a wrapper script.
- **Should the response include row-count metadata in a trailer?** Decision: no. CSV is a streaming format; trailers aren't standard. The cap header carries the only signal we need.
- **What if a row's `payload_before` is non-string non-null?** Decision: `JSON.stringify(value)` is total — handles arrays, numbers, booleans, nested objects. The CSV escape wraps the resulting string for any embedded commas/quotes/newlines.
