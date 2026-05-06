/**
 * M2 Wave 1.11 — m2-audit-log-fts: shared SQL fragment constants for the
 * dual-config (Spanish + English) functional GIN indexes on `audit_log`.
 *
 * The migration's `CREATE INDEX … USING GIN (<expression>)` and the service's
 * `WHERE … @@ tsquery` / `ORDER BY GREATEST(ts_rank…)` clauses MUST reference
 * the EXACT same SQL expression character-for-character — otherwise the
 * Postgres planner cannot match the WHERE expression to the indexed
 * expression and falls back to a sequential scan.
 *
 * Drift between migration and service is the dominant failure mode for
 * functional-index FTS setups. We codify the expressions exactly once here
 * and consume them from both sides, eliminating the drift surface.
 *
 * The QueryBuilder uses alias `a` for the audit_log table; the migration
 * does not. We export TWO parallel constants per language: one with the
 * `a.` prefix (for the service), one without (for the migration). The only
 * allowed transformation is the `.replace(/a\./g, '')` shown below.
 */

/** Spanish-config tsvector expression with QueryBuilder alias prefix `a.`. */
export const ES_VECTOR_SQL = `
  jsonb_to_tsvector('spanish', coalesce(a.payload_before, '{}'::jsonb), '["string"]')
  || jsonb_to_tsvector('spanish', coalesce(a.payload_after, '{}'::jsonb), '["string"]')
  || to_tsvector('spanish', coalesce(a.reason, ''))
  || to_tsvector('spanish', coalesce(a.snippet, ''))
`.trim();

/** English-config tsvector expression with QueryBuilder alias prefix `a.`. */
export const EN_VECTOR_SQL = `
  jsonb_to_tsvector('english', coalesce(a.payload_before, '{}'::jsonb), '["string"]')
  || jsonb_to_tsvector('english', coalesce(a.payload_after, '{}'::jsonb), '["string"]')
  || to_tsvector('english', coalesce(a.reason, ''))
  || to_tsvector('english', coalesce(a.snippet, ''))
`.trim();

/** Spanish-config expression for the migration (alias prefix stripped). */
export const ES_VECTOR_SQL_MIGRATION = ES_VECTOR_SQL.replace(/a\./g, '');

/** English-config expression for the migration (alias prefix stripped). */
export const EN_VECTOR_SQL_MIGRATION = EN_VECTOR_SQL.replace(/a\./g, '');
