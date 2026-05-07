# Spec: m2-audit-log-ui

> Wave 1.19. Acceptance scenarios for the Owner+Manager audit-log browse UI.

## Scenario: WHEN an Owner OR Manager visits /audit-log, THEN the table renders with the last-30d default window

```
GIVEN  An authenticated user with role 'OWNER' or 'MANAGER'
WHEN   They navigate to /audit-log
THEN   apps/web fires GET /audit-log?organizationId=<theirs>
       AND The result rows render in <AuditLogTable>
       AND The pagination footer shows "<n> de <total> eventos"
       AND The default filter values match: no event-type / no aggregate-type /
            no actor-kind / since=now-30d / until=now / q=''.
```

## Scenario: WHEN a Staff user visits /audit-log, THEN access is denied client-side and zero fetches fire

```
GIVEN  An authenticated user with role 'STAFF' OR signed-out
WHEN   They navigate to /audit-log
THEN   <RoleGuard role={['OWNER', 'MANAGER']}> short-circuits
       AND An access-denied fallback renders
       AND No GET /audit-log fetch fires.
```

## Scenario: WHEN an operator changes a filter and clicks Apply, THEN the table refetches with the new filter

```
GIVEN  /audit-log loaded with default filter
WHEN   The operator checks the "AGENT_ACTION_FORENSIC" event-type checkbox
       AND clicks "Apply"
THEN   The form state's eventType array contains 'AGENT_ACTION_FORENSIC'
       AND apps/web fires GET /audit-log?eventType=AGENT_ACTION_FORENSIC&...
       AND The previous result rows clear; the new result renders
       AND The Load-more button visibility updates per the new total.
```

## Scenario: WHEN the operator clicks "Reset", THEN the form returns to default values

```
GIVEN  Filter form has non-default values (e.g. eventType selected, q='tomate')
WHEN   The operator clicks "Reset"
THEN   The form state matches the default
       AND The next Apply / fetch issues without filters.
```

## Scenario: WHEN the operator clicks a row, THEN its payload_before/payload_after appear inline

```
GIVEN  Table renders rows
WHEN   The operator clicks row N
THEN   Row N's <AuditLogRowDetail> renders below it (or replaces it, expanded)
       AND The detail shows payload_before (left) + payload_after (right) as JSON
       AND The detail shows reason + citationUrl + snippet when present.

WHEN   The operator clicks row N again OR clicks row M ≠ N
THEN   Row N's detail collapses
       AND Row M's detail expands (if M was clicked).
```

## Scenario: WHEN the table has more rows than rendered, THEN Load-more is visible and increments offset on click

```
GIVEN  apps/api returns rows.length=50 and total=120
WHEN   The "Load more" button renders in the table footer
       AND The operator clicks it
THEN   apps/web fires GET /audit-log?...&offset=50
       AND The next 50 rows append to the existing rows in <AuditLogTable>
       AND The pagination footer updates to "100 de 120 eventos".

WHEN   rows.length === total
THEN   The Load-more button is hidden.
```

## Scenario: WHEN the operator clicks "Export CSV", THEN GET /audit-log/export.csv opens with current filters

```
GIVEN  Filter state has eventType=['AGENT_ACTION_FORENSIC'], since='2026-01-01'
WHEN   The operator clicks "Export CSV"
THEN   The browser opens a new tab pointing to
       GET /audit-log/export.csv?eventType=AGENT_ACTION_FORENSIC&since=2026-01-01&...
       AND The browser downloads the response as audit-log-<YYYY-MM-DD>.csv
       AND The button does NOT block the UI thread (browser-driven download).
```

## Scenario: WHEN the FTS input changes, THEN the query is debounced 300ms before firing

```
GIVEN  Filter form rendered with q=''
WHEN   The operator types "tomate" character-by-character (5 keystrokes)
THEN   The hook does NOT fire a fetch on each keystroke
       AND 300ms after the last keystroke, ONE GET /audit-log?q=tomate fires.
```

## Scenario: WHEN apps/api returns 422 (invalid filter), THEN the form surfaces the error inline

```
GIVEN  The operator submits since='2025-01-01' and until='2024-12-31' (range inverted)
WHEN   apps/api returns 422 with {code: 'AUDIT_LOG_QUERY_ERROR', message: 'invalid range'}
THEN   The screen renders the error message above the table
       AND The form remains editable so the operator can correct the dates.
```

## Scenario: WHEN nav renders, THEN the audit-log link is visible to Owner+Manager and hidden for Staff

```
GIVEN  Authenticated user
WHEN   App.tsx header renders
THEN   The "Audit log" link is visible iff currentRole ∈ ['OWNER', 'MANAGER']
       AND For Staff role, the link is absent from the nav.
```

## Scenario: WHEN payload_before/payload_after are large, THEN <AuditLogRowDetail> bounds visual size with overflow scroll

```
GIVEN  A row with payload_after of >2KB
WHEN   The operator expands the row
THEN   The <pre> for payload_after has max-h-96 overflow-auto
       AND The full content is reachable via scroll OR the copy-to-clipboard button.
```
