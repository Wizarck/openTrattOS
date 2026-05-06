## ADDED Requirements

### Requirement: `audit_log` table indexed for dual-config full-text search

Two functional GIN indexes SHALL exist on the `audit_log` table — one over the Spanish-config tsvector expression, one over the English-config tsvector expression — each combining `payload_before` (jsonb), `payload_after` (jsonb), `reason` (text), and `snippet` (text) into a single tsvector via `||`. The jsonb columns SHALL be indexed via `jsonb_to_tsvector('<lang>', coalesce(<col>, '{}'::jsonb), '["string"]')` so only string-typed values are tokenised; the text columns SHALL be indexed via `to_tsvector('<lang>', coalesce(<col>, ''))`.

#### Scenario: both functional GIN indexes exist after migration 0019

- **WHEN** migration `0019_audit_log_fts.ts` `up()` runs against an empty or populated `audit_log` table
- **THEN** indexes `ix_audit_log_fts_es` and `ix_audit_log_fts_en` exist with `indexdef LIKE '%USING gin%jsonb_to_tsvector%spanish%'` and `'%english%'` respectively, AND any existing rows are searchable immediately (no manual backfill step)

#### Scenario: down-migration drops both indexes cleanly

- **WHEN** migration `0019_audit_log_fts.ts` `down()` runs
- **THEN** both `ix_audit_log_fts_es` and `ix_audit_log_fts_en` no longer exist; the underlying `audit_log` columns are untouched

### Requirement: `GET /audit-log` accepts an optional `q` parameter for full-text search

The `AuditLogQueryDto` SHALL accept an optional `q?: string` field, capped at 200 characters. When present, `AuditLogService.query()` SHALL add a WHERE clause that ORs the Spanish and English tsquery matches against the matching tsvector expressions, AND replaces the default `created_at DESC` ordering with `GREATEST(ts_rank_es, ts_rank_en) DESC, created_at DESC`. When absent, query behaviour SHALL be identical to the pre-FTS implementation.

#### Scenario: q matches Spanish stem

- **WHEN** a Manager calls `GET /audit-log?organizationId=…&q=tomate`
- **THEN** the response includes every audit_log row whose `payload_before`, `payload_after`, `reason`, or `snippet` contains a Spanish-stemmed match for `tomate` (e.g. `tomate`, `tomates`, `tomatera`)

#### Scenario: q matches English stem

- **WHEN** a Manager calls `GET /audit-log?organizationId=…&q=chicken`
- **THEN** the response includes every audit_log row whose searchable fields contain an English-stemmed match for `chicken` (e.g. `chicken`, `chickens`, `chicken's`)

#### Scenario: q matches across both configs in one query

- **WHEN** a Manager calls `GET /audit-log?organizationId=…&q=tomato`
- **THEN** the response includes rows matching the English `tomato` lemma AND rows where the Spanish stemmer produces an overlapping root; both contribute candidates and ranking decides ordering

#### Scenario: q absent preserves date-desc ordering

- **WHEN** a Manager calls `GET /audit-log?organizationId=…` (no `q`)
- **THEN** the query plan does not reference `ix_audit_log_fts_es` or `ix_audit_log_fts_en`, no `ts_rank` is computed, and rows are ordered by `created_at DESC` only

#### Scenario: q is length-capped at the DTO

- **WHEN** a Manager calls `GET /audit-log?organizationId=…&q=<201-character string>`
- **THEN** the request is rejected with HTTP 400 and a class-validator error message naming the `q` field

### Requirement: ranking orders results by relevance with recency tiebreaker

When `q` is present, results SHALL be ordered by `GREATEST(ts_rank(es_vector, q_es), ts_rank(en_vector, q_en)) DESC` first, then by `created_at DESC` as tiebreaker. Rows matching `q` in more searchable columns SHALL appear before rows matching `q` in fewer columns; rows matching only via the language config that owns the query token SHALL appear above rows matching only via cross-config stemming overlap.

#### Scenario: more matches outrank fewer matches

- **WHEN** two audit_log rows both match `q='tomate'` — one with `tomate` appearing in `payload_after.note`, `reason`, and `snippet` (3 matches), the other with `tomate` only in `payload_after.note` (1 match)
- **THEN** the 3-match row appears before the 1-match row

#### Scenario: cross-config ranking favours the native-language match

- **WHEN** two audit_log rows both surface in a `q='tomato'` search — row E has the literal English token `tomato` in `payload_after.note`, row B has only the Spanish-stemmed `tomate` (which the English stemmer doesn't produce, so row B only matches if a cross-config stem overlap exists)
- **THEN** row E ranks above row B because the English vector produces a stronger `ts_rank` for the English query

#### Scenario: identical rank breaks by recency

- **WHEN** two audit_log rows have identical text content (and therefore identical `ts_rank` for the same `q`)
- **THEN** the row with the more recent `created_at` appears first

### Requirement: `q` combines AND-wise with all existing audit-log filters

The new `q` parameter SHALL combine via SQL AND with every other filter accepted by `AuditLogService.query()` — `aggregateType`, `aggregateId`, `eventType`, `actorUserId`, `actorKind`, `since`, `until`, and `limit`.

#### Scenario: q + aggregateType narrows the result set

- **WHEN** a Manager calls `GET /audit-log?organizationId=…&q=tomate&aggregateType=recipe`
- **THEN** the response includes only rows that match `q='tomate'` AND have `aggregate_type='recipe'`

### Requirement: SQL fragment constants prevent migration / service drift

The Spanish and English tsvector SQL expressions SHALL be defined exactly once, in `apps/api/src/audit-log/application/audit-log-fts.sql.ts`, and referenced from both the migration and the service. Two parallel constants SHALL exist: one with the QueryBuilder alias prefix (`a.`) for service use, one with the prefix stripped for migration use. The CI INT spec SHALL include an `EXPLAIN`-based assertion that surfaces any drift between the index expression and the service's WHERE expression.

#### Scenario: EXPLAIN confirms index is used

- **WHEN** the FTS INT spec runs `EXPLAIN (FORMAT JSON) SELECT * FROM audit_log a WHERE … (the WHERE clause built by AuditLogService.query with q='tomate') …`
- **THEN** the plan output contains a `Bitmap Index Scan` node referencing `ix_audit_log_fts_es` OR `ix_audit_log_fts_en` (or both); a Sequential Scan would fail the test, surfacing drift between migration and service expressions
