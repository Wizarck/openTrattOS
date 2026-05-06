## Why

`m2-audit-log` (Wave 1.9, PR #90) shipped the canonical `audit_log` table with three indexes optimised for drill-down by aggregate / global event-type / per-user history. None of those indexes support free-text search — Lourdes (head chef) cannot ask "show me every change that mentions `tomate`" today. The data is there (`payload_after.components[].componentName` after Wave 1.10's enrichment, plus `reason` and `snippet` on every row) but the query plan is a sequential scan.

This slice adds Postgres full-text search via TWO **functional GIN indexes** (one Spanish, one English) over the four searchable columns, so cross-BC textual search is fast in both languages. The existing `GET /audit-log` endpoint gains an optional `?q=<text>` parameter; when present, the query searches both configs and orders by relevance with a recency tiebreaker.

## What Changes

- **Migration `0019_audit_log_fts.ts`** — creates two functional GIN indexes on `audit_log`:
  - `ix_audit_log_fts_es` over `jsonb_to_tsvector('spanish', payload_before, '["string"]') || jsonb_to_tsvector('spanish', payload_after, '["string"]') || to_tsvector('spanish', coalesce(reason,'')) || to_tsvector('spanish', coalesce(snippet,''))`.
  - `ix_audit_log_fts_en` — same structure, `'english'` config.
  - No table column added. No backfill needed: Postgres builds functional indexes by scanning all existing rows at `CREATE INDEX` time.
- **`AuditLogService.query()` extended** — accepts an optional `q?: string`. When set, the `WHERE` adds an OR'd clause that bitmap-ANDs both functional indexes; the `ORDER BY` switches to `GREATEST(ts_rank_es, ts_rank_en) DESC, a.created_at DESC`.
- **`AuditLogQueryDto` extended** — new optional `q?: string` (≤200 chars, validated by class-validator).
- **NO entity changes** — functional indexes don't require column annotations; `AuditLog` entity is untouched.
- **BREAKING**: none. `q` is optional; absent → exactly the existing query semantics.

## Capabilities

### New Capabilities

(none — extends the existing audit-log query capability with FTS.)

### Modified Capabilities

- **`m2-audit-log`** — `GET /audit-log` gains an optional `q` parameter for full-text search; ranking via `ts_rank` across both Spanish and English configs when `q` is present.

## Impact

- **Prerequisites**: `m2-audit-log` (Wave 1.9, `1e420a6`) + `m2-audit-log-cost-history-merge` (Wave 1.10, `c43456d`) merged.
- **Code**:
  - `apps/api/src/migrations/0019_audit_log_fts.ts` — both functional GIN indexes in one transaction.
  - `apps/api/src/audit-log/application/audit-log.service.ts` — accept `q` in filter; build dual-config tsquery clause + GREATEST-rank ordering.
  - `apps/api/src/audit-log/application/types.ts` — add `q?: string` to `AuditLogFilter`.
  - `apps/api/src/audit-log/interface/dto/audit-log-query.dto.ts` — add `@IsOptional @IsString @MaxLength(200) q?` field.
  - `apps/api/src/audit-log/application/audit-log-fts.sql.ts` (NEW) — exported SQL fragment constants for the two language vectors so query and migration stay in sync.
- **Tests**: ≥6 net new unit tests (filter param plumbing) + 1 INT spec (Postgres `tsvector` round-trip with mixed Spanish/English seed data) covering: stem matching per config, cross-config ranking, recency tiebreaker, AND-with-other-filters, no-match case, DTO length cap.
- **Performance**: Two GIN indexes on `audit_log` — insert cost grows by 2 GIN updates per row (deferred via `gin_pending_list`). For the audit_log write profile (~500 rows/min/heavy-org, already 3 indexes), this is a ~67% per-insert cost increase relative to the existing 3 indexes — acceptable on a write-heavy-but-not-latency-critical table. Read path: `O(log N)` bitmap-OR of the two GIN indexes.
- **Storage**: each functional GIN index is ~30–50 % of the stored expression's tokenised size. For a 22 GB/month/heavy-org audit_log volume, ~+6 GB/month total across both indexes. Trade-off accepted.
- **Locale**: dual-config (Spanish + English) — Lourdes searches in castellano; OFF/USDA payload fragments are English. SD3=a: every `q` is searched against both configs; client doesn't declare language. Stemming makes `tomate` match `tomates` and `chicken` match `chickens` automatically.
- **Rollback**: drop both GIN indexes. No data loss (no column added, no row mutation).
- **Out of scope**:
  - **Weighted ranking** — `setweight()` boosting `reason`+`snippet` over `payload_*` (filed as `m2-audit-log-fts-weighted` if ranking quality feedback warrants).
  - **Substring search** (`pg_trgm`) — `car` matching `carrot`. Filed as `m2-audit-log-fts-trigram`.
  - **Highlighting** (`ts_headline`). Filed as `m2-audit-log-fts-highlight`.
  - **Per-language `lang` query param** — currently always-both per SD3=a. Filed as `m2-audit-log-fts-lang-hint` if performance pressures emerge.
  - `m2-audit-log-export` (Wave 1.12).
