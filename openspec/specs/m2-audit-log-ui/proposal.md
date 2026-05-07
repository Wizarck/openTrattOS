# Proposal: m2-audit-log-ui

> **Wave 1.19** — Owner+Manager UI for the canonical `audit_log`. Renders a filterable, paginated table of events with inline drill-down for each row's `payload_before` / `payload_after`. **Slice #4 of 4 in the user's backend tech-debt batch.**

## Problem

Wave 1.9 (`m2-audit-log`) shipped the backend query endpoint `GET /audit-log` with filters + pagination. Wave 1.11 added `?q=` FTS. Wave 1.12 added `GET /audit-log/export.csv`. Wave 1.14 split agent emissions and added the canonical operator runbook. **No UI consumes any of it today** — operators query the audit log via curl / Postman / psql.

Today the value of audit_log is hidden behind tooling friction. A Manager investigating a chef-flagged anomaly ("which Owner changed this allergen and why?") can't browse the trail unless they're comfortable with HTTP + jq. The Wave 1.14 retro filed `m2-audit-log-ui` as the natural follow-up; this slice closes it.

## Goals

1. **`/audit-log` screen in apps/web** — Owner+Manager gated via the existing `<RoleGuard>` (Wave 1.15). Composed of:
   - **`<AuditLogFilters>`** controlled filter form: event-type multi-select, aggregate-type select, actor-kind select, since/until date inputs, FTS text input, `Apply` + `Reset` buttons.
   - **`<AuditLogTable>`** presentational table with 6 columns: timestamp (ISO short), event_type, aggregate (type:id), actor (kind + name/userId), reason snippet, expand toggle. Click a row to open the drill-down inline.
   - **`<AuditLogRowDetail>`** collapsible payload viewer — renders `payload_before` + `payload_after` as pretty-printed JSON in a `<pre>` block; copies-to-clipboard button per side.
   - **"Load more" button** at the table bottom that increments `offset` by `limit` (default 50, max 200) until total is reached. No page numbers (matches the existing CSV export cursor pattern).
   - **"Export CSV" button** in the filter bar that opens `GET /audit-log/export.csv?<currentFilters>` in a new tab — browser handles the download.
2. **`useAuditLogQuery` hook** in apps/web — TanStack `useQuery` keyed on the filter object. 30s stale time. Debounces the FTS `q` input by 300ms before firing the query.
3. **Nav link** added to `App.tsx` header gated by `RoleGuard role={['OWNER', 'MANAGER']}`.
4. **5 ui-kit components delivered** (3 new + 2 pre-existing reused: `RoleGuard`, `LabelFieldsForm`'s field shape patterns).

## Non-goals

- **Aggregate drill-down navigation** — clicking an `aggregate_id` in the table linking to the source entity (e.g. recipe page) is filed as `m2-audit-log-ui-aggregate-deeplink`. Today the drill-down stays inline.
- **Search highlighting (`ts_headline()`)** — the FTS query returns the raw row; matched-term highlighting in the UI is filed as `m2-audit-log-ui-fts-highlight` (depends on backend slice `m2-audit-log-fts-highlight`).
- **Real-time updates / streaming** — table refreshes only when filters change or on manual refresh. WebSocket / SSE push is filed as `m2-audit-log-ui-realtime`.
- **Filter saving / shared queries** — bookmarking a filter set as a named "saved view" is filed as `m2-audit-log-ui-saved-views`.
- **Backend changes** — none. Wave 1.9-1.12-1.14 already shipped the endpoints + filters + FTS + CSV. Pure frontend slice.
- **Internationalization** — labels render in Spanish per the existing apps/web convention. i18n consolidation is M3 scope (`m2-i18n-ui-kit`).

## What changes (high level)

**`packages/ui-kit/`:**

- `components/AuditLogTable/` (NEW) — presentational table:
  - Props: `rows: AuditLogRow[]`, `expandedRowId: string | null`, `onToggleExpand: (id) => void`, `loading: boolean`.
  - 6 columns; row click toggles expansion; expanded row replaces with `<AuditLogRowDetail>`.
  - Empty state: "No hay eventos para los filtros aplicados".
- `components/AuditLogFilters/` (NEW) — controlled filter form:
  - Props: `values: AuditLogFilterValues`, `onChange: (values) => void`, `onApply: () => void`, `onReset: () => void`, `onExportCsv: () => void`.
  - Sections: event-type checkboxes (5-10 known types), aggregate-type select, actor-kind radio, since/until inputs, FTS input.
- `components/AuditLogRowDetail/` (NEW) — payload viewer:
  - Props: `payloadBefore: unknown`, `payloadAfter: unknown`, `reason: string | null`, `citationUrl: string | null`, `snippet: string | null`.
  - Two columns side-by-side: payload_before (left) + payload_after (right); each in `<pre>` with copy button. Below: reason + citation link + snippet block.

**`apps/web/`:**

- `src/api/auditLog.ts` (NEW) — typed fetch helpers `getAuditLog(filter)` + `buildExportUrl(filter)`.
- `src/hooks/useAuditLog.ts` (NEW) — `useAuditLogQuery(filter)` with 300ms debounce on `q`.
- `src/screens/AuditLogScreen.tsx` (NEW) — composes the 3 ui-kit components + RoleGuard + Load-more pagination + Export CSV.
- `src/screens/AuditLogScreen.test.tsx` (NEW) — 4 vitest tests (Owner sees rows; non-Owner-non-Manager sees fallback; filter change refetches; load-more increments offset).
- `src/main.tsx` — register `/audit-log` route.
- `src/App.tsx` — add nav link gated by `RoleGuard role={['OWNER', 'MANAGER']}`.

**Shared types:**

- `packages/ui-kit/src/components/AuditLogTable/AuditLogTable.types.ts` — `AuditLogRow` interface (mirrors apps/api `AuditLogResponseDto`).
- `packages/ui-kit/src/components/AuditLogFilters/AuditLogFilters.types.ts` — `AuditLogFilterValues` interface.

## Acceptance

1. Visiting `/audit-log` as an Owner OR Manager fetches the first page (default 50 rows, last-30d window) and renders them in `<AuditLogTable>`.
2. Visiting `/audit-log` as Staff: `<RoleGuard>` short-circuits; an access-denied fallback renders; **zero fetches fire**.
3. Editing a filter (e.g. event-type checkbox toggle) updates the form state; clicking "Apply" refetches with the new filter; the table replaces.
4. The "Reset" button restores the form to default values (no event-type filter, last-30d window).
5. Clicking a row expands its payload-before/payload-after detail inline; clicking again (or another row) collapses.
6. The "Load more" button at table bottom is visible only when `total > rows.length`; clicking it appends the next page (`offset += limit`).
7. The "Export CSV" button opens `GET /audit-log/export.csv?<filters>` in a new tab with the current filters preserved; the browser downloads `audit-log-YYYY-MM-DD.csv`.
8. The FTS input debounces 300ms before firing the query.
9. apps/web build + lint clean. ui-kit suite passes (3 new components × tests). Storybook builds with new stories.

## Risk + mitigation

- **Risk: large `payload_*` JSON renders unbounded `<pre>`.** Mitigation: `<pre>` has `max-h-96 overflow-auto` to bound visual size; copy-button gives the operator the full content. Future: collapse-by-default for >5KB payloads (filed `m2-audit-log-ui-large-payload-fold`).
- **Risk: FTS query string contains user-controlled text exposed to URL.** Mitigation: the apps/api endpoint already accepts `q` via standard URL encoding; no XSS risk because the response shape is JSON. The frontend renders the FTS-matched rows as plain text (no `dangerouslySetInnerHTML`).
- **Risk: filter state is not URL-routable** — refreshing the page loses the filter selection. Mitigation: filter state stays in component state for v0; URL-sync (`?eventType=AGENT_ACTION_FORENSIC&since=...`) is filed as `m2-audit-log-ui-url-sync`.
- **Risk: total row count ambiguity (the page shows "100 of ??")** — apps/api returns `total` only for the current filter; if `total > 200` the user keeps seeing "Load more" but the count is exact. Mitigation: render the count as "100 de 543 eventos" so it's clear.

## Open questions

None at the time of writing — Gate D picks confirmed (new screen / 3 ui-kit components / Load-more pagination / inline drill-down / export CSV link).

## Related slices + threads

- Wave 1.9 `m2-audit-log` (`1e420a6`) — backend `GET /audit-log` query endpoint.
- Wave 1.11 `m2-audit-log-fts` (`e7e1fb1`) — FTS `?q=` parameter consumed by this UI.
- Wave 1.12 `m2-audit-log-export` (`87d5c91`) — `GET /audit-log/export.csv` consumed by this UI's Export button.
- Wave 1.14 `m2-audit-log-forensic-split` (`339b039`) — established the audit-log canonical runbook + ADR set this UI surfaces.
- Wave 1.15 `m2-labels-print-config-ui` (`aa77f7f`) — established the `<RoleGuard>` primitive + apps/web screen pattern this slice reuses.
- Wave 1.16-1.18 — slices #1-#3 of this 4-slice batch.

## Filed follow-ups

- `m2-audit-log-ui-aggregate-deeplink` — clickable aggregate_id → source entity page.
- `m2-audit-log-ui-fts-highlight` — `ts_headline()` integration when backend ships it.
- `m2-audit-log-ui-realtime` — WebSocket / SSE for live row append.
- `m2-audit-log-ui-saved-views` — named filter sets.
- `m2-audit-log-ui-url-sync` — query params reflect filter state.
- `m2-audit-log-ui-large-payload-fold` — collapse-by-default for >5KB payloads.
