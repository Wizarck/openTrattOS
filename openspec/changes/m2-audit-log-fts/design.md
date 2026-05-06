## Context

The audit_log table (Wave 1.9, enriched by Wave 1.10) carries every business mutation event with `payload_before`, `payload_after`, `reason`, and `snippet`. The current query API supports drill-down by aggregate / event type / actor / date range — but no free-text search. Operators wanting "every change that mentions tomate" do a sequential scan.

Postgres ships full-text search via `tsvector` + GIN index. This slice adds it.

The user (Master) explicitly picked the dual-config + functional-index path over the simpler "single Spanish generated `tsv` column" alternative because:
1. Audit payloads mix Spanish (operator notes, reasons) and English (OFF/USDA brand names, supplier names, product descriptions). A Spanish-only tsvector would miss English stems entirely.
2. A functional GIN index avoids adding a stored column to a write-heavy table — saves row size and avoids the generated-column write overhead on every insert.

## Goals / Non-Goals

**Goals:**
- Sub-second `WHERE … @@ plainto_tsquery(…)` over the `audit_log` table even at multi-million-row scale.
- Spanish stemming so `tomate` matches `tomates`, `tomatera`, etc. AND English stemming so `chicken` matches `chickens`, `chicken's`, etc.
- Backward-compatible API: `q` is optional; absent → existing query semantics.
- Ranking: when `q` is set, results return ranked by relevance + recency tiebreaker.
- Client doesn't declare language — both configs are queried automatically (SD3=a).

**Non-Goals:**
- Weighted ranking (`setweight()` to boost `reason`+`snippet`). Filed as follow-up.
- Substring search (`car` matching `carrot`). Filed as `m2-audit-log-fts-trigram`.
- Search inside specific jsonb keys. The `jsonb_to_tsvector(..., '["string"]')` extracts ALL string values from the jsonb tree; we don't restrict to specific keys.
- Highlighting / snippet generation in the response (`ts_headline()`).
- Per-language `lang` query param.

## Decisions

### ADR-FTS-INDEX-SHAPE — two functional GIN indexes, one per config (F1=a + SD1=b)

```sql
CREATE INDEX ix_audit_log_fts_es ON audit_log USING GIN (
  (
    jsonb_to_tsvector('spanish', coalesce(payload_before, '{}'::jsonb), '["string"]') ||
    jsonb_to_tsvector('spanish', coalesce(payload_after,  '{}'::jsonb), '["string"]') ||
    to_tsvector('spanish', coalesce(reason,  '')) ||
    to_tsvector('spanish', coalesce(snippet, ''))
  )
);

CREATE INDEX ix_audit_log_fts_en ON audit_log USING GIN (
  (
    jsonb_to_tsvector('english', coalesce(payload_before, '{}'::jsonb), '["string"]') ||
    jsonb_to_tsvector('english', coalesce(payload_after,  '{}'::jsonb), '["string"]') ||
    to_tsvector('english', coalesce(reason,  '')) ||
    to_tsvector('english', coalesce(snippet, ''))
  )
);
```

Rationale:
- **Functional index (no stored column)** — `CREATE INDEX … USING GIN (<expression>)` builds a derived index over the rows without adding a `tsv` column. Postgres reads each row at `CREATE INDEX` time, evaluates the expression, and stores the result in the index. Saves row size (~10–30 % vs a stored `tsvector` column) and avoids the per-insert generated-column overhead. Critical: the WHERE clause expression must match the index expression character-for-character for the planner to use the index — codified by exporting the expression as a string constant in `audit-log-fts.sql.ts` so query and migration stay in sync.
- **Two separate indexes per config** (SD1=b, rejecting SD1=a "single combined expression"): each index has a simpler expression → planner uses it more aggressively; bitmap-OR across both indexes is the canonical multi-language pattern. Trade-off: 2× GIN insert cost vs SD1=a's 1×. Accepted; audit_log writes are not latency-critical.
- **`jsonb_to_tsvector(..., '["string"]')`** for `payload_before` / `payload_after`: extracts only the string values inside the jsonb tree, skipping numeric values, booleans, keys, and JSON punctuation. Exactly the right behaviour — a `costPerBaseUnit: 1.234` field shouldn't tokenise `1.234` as a search term. The `'["string"]'` filter argument is jsonb syntax for "string-typed values only". Alternative `to_tsvector(payload::text)` was considered: it would tokenise the JSON serialisation including keys (`payloadAfter`, `componentName`) and punctuation noise; rejected as worse signal-to-noise.
- **`to_tsvector('lang', coalesce(col, ''))`** for `reason` and `snippet`: these are plain text columns, not jsonb. `coalesce` is null-safe.
- **`coalesce(payload, '{}'::jsonb)`** — null-safe for the rare case of a NULL jsonb column. `'{}'::jsonb` evaluates to an empty tsvector.
- **No `setweight` (SD2=a)** — equal weight across all four searchable columns. Simpler; revisit in `m2-audit-log-fts-weighted` if ranking quality is poor.

### ADR-FTS-QUERY — OR'd dual-config WHERE + GREATEST-rank ORDER BY (F2=d + SD3=a)

```ts
// AuditLogService.query(filter), when filter.q is present
qb.andWhere(`(
  (${ES_VECTOR_SQL}) @@ plainto_tsquery('spanish', :q)
  OR
  (${EN_VECTOR_SQL}) @@ plainto_tsquery('english', :q)
)`, { q: filter.q });

qb.orderBy(`GREATEST(
  ts_rank((${ES_VECTOR_SQL}), plainto_tsquery('spanish', :q)),
  ts_rank((${EN_VECTOR_SQL}), plainto_tsquery('english', :q))
)`, 'DESC')
  .addOrderBy('a.created_at', 'DESC');
```

Where `ES_VECTOR_SQL` and `EN_VECTOR_SQL` are SHARED string constants (exported from `audit-log-fts.sql.ts`) used both here AND in the migration's `CREATE INDEX` clauses. This guarantees char-exact match for the functional-index planner contract.

Rationale:
- **`plainto_tsquery`** parses user input safely — handles single words, multi-word phrases, whitespace. Alternative `to_tsquery` requires `&` / `|` / `!` operators in the input; rejected as too niche for chef-facing endpoints.
- **OR'd dual config (SD3=a)** — a `q` matches if EITHER the Spanish-stemmed OR the English-stemmed expression hits. The chef writes `tomate` → matches Spanish stem; writes `chicken` → matches English stem; writes `tomato` → matches English stem (singular form). Lourdes doesn't have to declare which language she's searching in.
- **`GREATEST(ts_rank_es, ts_rank_en)` DESC** — when the same row matches both configs (rare but possible — e.g. a row with both English and Spanish tokens that share a query stem), take the higher rank. Alternative `ts_rank_es + ts_rank_en` would double-count; rejected.
- **`created_at` DESC tiebreaker** — when two rows have the same rank (very common with `plainto_tsquery`'s coarse ranking), newer first. Matches operator intuition.
- **No `q` → existing behaviour** — date-desc order, no rank computation. Backward compatible.

### ADR-FTS-DTO — add optional `q` field, length-capped (F3=a)

```ts
@IsOptional()
@IsString()
@MaxLength(200)
q?: string;
```

Rationale:
- 200 chars is generous for any reasonable query. Caps prevent payload-bombing.
- `plainto_tsquery` handles malicious-looking input safely (it's tokenised, not regex).
- Endpoint stays `GET /audit-log?q=…` (F3=a) — the FTS is scoped to the audit-log capability. If a future cross-BC search module emerges (M3+), it would be a separate module that USES audit-log's FTS internally; this slice is the foundation for that.

### ADR-FTS-NO-ENTITY-CHANGES — `AuditLog` entity untouched

Functional GIN indexes are pure database constructs — TypeORM has no awareness of them, no entity column required, no `select: false / insert: false / update: false` annotation needed. The entity stays exactly as Wave 1.9 shipped it. This is a key advantage of F1=a (functional) over F1=c (generated stored column): zero entity surface area, zero risk of TypeORM trying to write to a derived field.

### ADR-FTS-SQL-CONSTANTS — single source of truth for the vector expressions

Both the migration's `CREATE INDEX` clauses AND the service's WHERE/ORDER BY clauses must reference the EXACT same SQL expression for the functional index to be used. We codify this in:

```ts
// apps/api/src/audit-log/application/audit-log-fts.sql.ts
export const ES_VECTOR_SQL = `
  jsonb_to_tsvector('spanish', coalesce(a.payload_before, '{}'::jsonb), '["string"]') ||
  jsonb_to_tsvector('spanish', coalesce(a.payload_after,  '{}'::jsonb), '["string"]') ||
  to_tsvector('spanish', coalesce(a.reason,  '')) ||
  to_tsvector('spanish', coalesce(a.snippet, ''))
`;

export const EN_VECTOR_SQL = `…english variant…`;

// Migration uses the same fragments without the `a.` alias prefix:
export const ES_VECTOR_SQL_MIGRATION = ES_VECTOR_SQL.replace(/a\./g, '');
export const EN_VECTOR_SQL_MIGRATION = EN_VECTOR_SQL.replace(/a\./g, '');
```

Rationale: drift between migration and query is the dominant failure mode for functional-index Postgres setups. A single exported constant eliminates the drift entirely. The `.replace()` to strip the alias `a.` (used by the QueryBuilder) when building the migration text is the only allowed transformation.

## Risks / Trade-offs

- **[Risk] Index expression drift between migration and query.** **Mitigation**: shared SQL constants in `audit-log-fts.sql.ts` (ADR-FTS-SQL-CONSTANTS); both consumers reference the same string literal. The INT spec asserts the index is actually used (via `EXPLAIN` parse) so a drift surfaces immediately in CI.
- **[Risk] `jsonb_to_tsvector` requires Postgres ≥ 11.** **Mitigation**: project is on Postgres 16; documented in `docs/architecture-decisions.md` ADR-006.
- **[Risk] OR'd dual-config WHERE bypasses bitmap-AND optimization.** **Mitigation**: with both indexes built, Postgres uses bitmap-OR of the two GIN indexes, then bitmap-ANDs against `org_id` from the existing aggregate index. Verified in `EXPLAIN` during INT testing.
- **[Risk] `ts_rank` with `GREATEST` is approximate.** **Mitigation**: ranking is a search affordance, not a search engine. Chef can refine the query.
- **[Risk] 2× GIN insert cost vs single index.** **Mitigation**: GIN inserts are deferred via `gin_pending_list`; audit_log writes are background-bus driven (not user-blocking); `~67%` insert overhead is in budget for this table profile.
- **[Risk] Spanish stop-words might filter too aggressively for code-y tokens.** **Mitigation**: Postgres's Spanish dictionary is ISpell-style; rare false-negatives possible (e.g. `de` is a stop word). The dual config means English will catch any English-tokenized variant. If a critical false-negative emerges, file `m2-audit-log-fts-stopwords` to switch to `simple` config or a custom dictionary.
- **[Trade-off] No weighted ranking.** Filed as `m2-audit-log-fts-weighted`.
- **[Trade-off] Always-both (no `lang` hint).** Filed as `m2-audit-log-fts-lang-hint` if performance pressures emerge.

## Migration Plan

1. Migration `0019_audit_log_fts.ts`:
   - `up()`:
     - Guard: `if (!await queryRunner.hasTable('audit_log')) return;`
     - `CREATE INDEX ix_audit_log_fts_es ON audit_log USING GIN ((${ES_VECTOR_SQL_MIGRATION}))`.
     - `CREATE INDEX ix_audit_log_fts_en ON audit_log USING GIN ((${EN_VECTOR_SQL_MIGRATION}))`.
     - Both in the same transaction. Postgres builds both by full-table-scan at `CREATE INDEX` time — no manual backfill (F4=OK).
   - `down()`:
     - `DROP INDEX IF EXISTS ix_audit_log_fts_es`.
     - `DROP INDEX IF EXISTS ix_audit_log_fts_en`.
2. `AuditLogFilter` type (`audit-log/application/types.ts`) gains `q?: string`.
3. `AuditLogService.query()` builds the dual-config WHERE + GREATEST-rank ORDER BY when `q` is present.
4. `AuditLogQueryDto` adds the validated optional field.
5. `audit-log-fts.sql.ts` exports the four SQL fragment constants.
6. INT spec seeds 6 audit rows with mixed text:
   - Row A: `payload_after.note='tomates frescos del huerto'`, `reason='SUPPLIER_PRICE_CHANGE'`.
   - Row B: `payload_after.note='salsa de tomate casera'`, `reason='LINE_EDIT'`.
   - Row C: `payload_after.note='chicken breast 2kg'`, `snippet='OFF lookup chicken breast'`.
   - Row D: `payload_after.note='pollo asado al horno'`, `reason='MANUAL_RECOMPUTE'`.
   - Row E: `payload_after.note='zanahoria + tomato sauce'`, `snippet='mixed-locale row'`.
   - Row F (control): `payload_after.note='cebolla'`, `reason='INITIAL'`.
   And asserts:
   - `q='tomate'` returns rows A, B, E (Spanish stems `tomate`/`tomates` + English-stemmed `tomato`).
   - `q='chicken'` returns row C (English stem).
   - `q='pollo'` returns row D (Spanish stem).
   - `q='inexistente'` returns 0 rows.
   - `q='tomate'` + `aggregateType='recipe'` filters AND-wise.
   - **Ranking — stable order (SD4-a)**: row matching `q` in 3 fields ranks above row matching only 1 field.
   - **Ranking — cross-config (SD4-b)**: `q='tomato'` ranks row E (English `tomato` literal hit) above row B (Spanish `tomate` stem hit only) — verifies F2=d wired up.
   - **Ranking — recency tiebreaker (SD4-c)**: two rows with identical rank ordered newest-first.
7. Unit specs cover the filter plumbing (mock `qb.andWhere` and `qb.orderBy` calls).
8. DTO test: `q` over 200 chars rejected by class-validator.

**Rollback**: `DROP INDEX × 2`. No data loss; underlying jsonb columns + reason + snippet are untouched.

## Open Questions

- **Should we strip whitespace + lowercase the `q` param at the DTO?** Decision: no. `plainto_tsquery` handles both internally; over-normalising loses information (e.g. quoted phrases would degrade).
- **Per-org rate limit on FTS queries?** Decision: no. If usage spikes, add at Cloudflare WAF level via operator runbook.
- **Expose `ts_rank` to the client?** Decision: no. Internal ordering only. Wire shape unchanged.
- **Should the migration use `CREATE INDEX CONCURRENTLY`?** Decision: no for now. CONCURRENTLY would allow zero-downtime index builds in production, but TypeORM migrations run inside a transaction and CONCURRENTLY can't run inside a transaction. For Wave 1.11's audit_log size (still small at this stage), regular `CREATE INDEX` is fine. If audit_log grows past ~10M rows before this lands, file `m2-audit-log-fts-online-build` to refactor as a non-transactional migration.
