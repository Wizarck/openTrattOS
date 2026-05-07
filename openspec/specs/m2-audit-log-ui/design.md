# Design: m2-audit-log-ui

> Wave 1.19. Companion: `proposal.md`. Slice #4 of 4 (final).

## Architecture

Frontend-only slice. Backend endpoints + filter contract + CSV export are all from prior waves; this slice consumes them.

```
apps/web/
  /audit-log
      │
      ▼
  AuditLogScreen
      │
      ├── <RoleGuard role={['OWNER', 'MANAGER']}>
      │      │
      │      ▼
      │  Inner({ orgId })
      │      ├── useAuditLogQuery(filterValues) ─→ GET /audit-log?...
      │      ├── filter form state (useState<AuditLogFilterValues>)
      │      ├── expandedRowId (useState<string | null>)
      │      │
      │      └── renders:
      │            <AuditLogFilters
      │              values={form}
      │              onChange={setForm}
      │              onApply={()=>setApplied(form)}
      │              onReset={...}
      │              onExportCsv={()=>window.open(buildExportUrl(applied))} />
      │            <AuditLogTable
      │              rows={query.data?.rows ?? []}
      │              expandedRowId={expandedRowId}
      │              onToggleExpand={...}
      │              loading={query.isPending} />
      │            <PaginationFooter
      │              total={query.data?.total ?? 0}
      │              shown={accumulatedRows.length}
      │              onLoadMore={()=>setApplied({...applied, offset: applied.offset+limit})} />
      │
      └── (non-Owner/Manager) <AccessDenied />
```

## Components

### `<AuditLogTable>` (NEW, packages/ui-kit)

```ts
interface AuditLogRow {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  actorUserId: string | null;
  actorKind: 'user' | 'agent' | 'system';
  agentName: string | null;
  payloadBefore: unknown;
  payloadAfter: unknown;
  reason: string | null;
  citationUrl: string | null;
  snippet: string | null;
  createdAt: string;
}

interface AuditLogTableProps {
  rows: AuditLogRow[];
  expandedRowId: string | null;
  onToggleExpand: (id: string) => void;
  loading?: boolean;
}
```

**Columns** (left → right):

1. **Timestamp** — `createdAt` formatted as `YYYY-MM-DD HH:MM:SS` (UTC).
2. **Event type** — monospace; truncate at 32 chars with title attribute for full string.
3. **Aggregate** — `${aggregateType}:${aggregateId.slice(0,8)}…`; click expands the row.
4. **Actor** — `${actorKind}` + `${agentName ?? actorUserId ?? '-'}` truncated.
5. **Reason** — first 60 chars of `reason` (if present); else "—".
6. **Expand** — chevron toggle showing expanded/collapsed state.

Empty state: "No hay eventos para los filtros aplicados." (when `rows.length === 0 && !loading`).

Loading state: skeleton rows (5 placeholder rows with shimmer) when `loading && rows.length === 0`.

### `<AuditLogRowDetail>` (NEW, packages/ui-kit)

```ts
interface AuditLogRowDetailProps {
  payloadBefore: unknown;
  payloadAfter: unknown;
  reason: string | null;
  citationUrl: string | null;
  snippet: string | null;
}
```

Renders inside the table row's expanded slot:

```
┌─────────────────────────────────────────────────────────────┐
│ payload_before        [📋]  │ payload_after         [📋]    │
│ ───────────────────────────  │ ───────────────────────────   │
│ <pre> JSON.stringify(...,   │ <pre> JSON.stringify(...,    │
│        null, 2)             │        null, 2)              │
│ </pre>                       │ </pre>                        │
│ max-h-96 overflow-auto       │ max-h-96 overflow-auto        │
└─────────────────────────────────────────────────────────────┘
│ Razón: <reason>                                              │
│ Cita: <citationUrl> (link)                                   │
│ Extracto: <snippet>                                          │
└─────────────────────────────────────────────────────────────┘
```

Copy-button uses `navigator.clipboard.writeText(JSON.stringify(payload, null, 2))`. Shows "Copiado" tooltip for 2s on success.

### `<AuditLogFilters>` (NEW, packages/ui-kit)

```ts
interface AuditLogFilterValues {
  eventType: string[];          // multi-checkbox
  aggregateType: string | null; // single select
  actorKind: 'user' | 'agent' | 'system' | null;
  since: string | null;          // ISO date YYYY-MM-DD
  until: string | null;
  q: string;                     // FTS
}

interface AuditLogFiltersProps {
  values: AuditLogFilterValues;
  onChange: (values: AuditLogFilterValues) => void;
  onApply: () => void;
  onReset: () => void;
  onExportCsv: () => void;
  applying?: boolean;            // disables Apply during fetch
}
```

**Layout**: 5 fieldsets stacked, "Apply" + "Reset" + "Export CSV" buttons at the bottom.

**Known event types** for the multi-checkbox:

```ts
const KNOWN_EVENT_TYPES = [
  'AGENT_ACTION_EXECUTED',
  'AGENT_ACTION_FORENSIC',
  'INGREDIENT_OVERRIDE_CHANGED',
  'RECIPE_ALLERGENS_OVERRIDE_CHANGED',
  'RECIPE_SOURCE_OVERRIDE_CHANGED',
  'RECIPE_INGREDIENT_UPDATED',
  'SUPPLIER_PRICE_UPDATED',
  'RECIPE_COST_REBUILT',
  'AI_SUGGESTION_ACCEPTED',
  'AI_SUGGESTION_REJECTED',
] as const;
```

**Known aggregate types**:

```ts
const KNOWN_AGGREGATE_TYPES = [
  'recipe',
  'menu_item',
  'ingredient',
  'supplier_item',
  'agent_credential',
  'organization',
  'ai_suggestion',
  'agent_chat_session',
] as const;
```

If a future BC introduces a new event_type or aggregate_type, the filter list won't auto-discover it; operators can still query via the FTS box. Filed as `m2-audit-log-ui-dynamic-types` if that becomes a real ergonomics issue.

## Hooks (apps/web)

### `useAuditLogQuery`

```ts
import { useQuery } from '@tanstack/react-query';
import { useDebouncedValue } from './useDebouncedValue';

export function useAuditLogQuery(filter: AppliedFilter) {
  // Debounce the FTS string only; other filters apply immediately on Apply.
  const debouncedQ = useDebouncedValue(filter.q, 300);
  const effectiveFilter = { ...filter, q: debouncedQ };
  return useQuery({
    queryKey: ['audit-log', effectiveFilter],
    queryFn: () => getAuditLog(effectiveFilter),
    staleTime: 30_000,
  });
}
```

`AppliedFilter` is the materialised filter (after Apply was clicked + offset). `filter` form state is separate from the applied filter; the form is local and only commits to applied on Apply.

### Pagination strategy

`AuditLogScreen` keeps two state slots:
- `appliedFilter` — the filter the latest fetch was issued with.
- `accumulatedRows: AuditLogRow[]` — rows accumulated across "Load more" clicks.

On Apply or Reset: `accumulatedRows = []`, `appliedFilter.offset = 0`.
On Load more: `appliedFilter.offset += limit`, query refires, hook returns next page → screen appends to `accumulatedRows`.

(Naive but works at the slice's expected scale of ≤1000 rows accumulated. Past that, virtualisation is `m2-audit-log-ui-virtualisation`.)

## Sub-decisions

### SD1 — Inline drill-down vs modal/sidesheet

Picked inline expansion per Gate D F4. Reasoning: keyboard navigation is simpler (no focus trap dance); audit rows are usually compared against neighbours so adjacency matters; modals add UX overhead for a power-user view.

### SD2 — "Load more" vs page numbers vs infinite scroll

Load-more matches the existing CSV cursor pattern (Wave 1.12) and avoids URL-routable page numbers (filed as `m2-audit-log-ui-url-sync`). Infinite scroll would require IntersectionObserver + scroll-position restore for the audit-log use case; not worth it for this slice.

### SD3 — Form state separate from applied state

Editing the form does NOT refire the query until Apply. This avoids fetch-storm on every checkbox click. The applied state is what the hook reads.

### SD4 — Export CSV is a window.open, not a fetch

`window.open(buildExportUrl(applied))` lets the browser handle the download (Content-Disposition header) without buffering the response in memory. The CSV button passes the same filters as the table fetch, so what you see is what you export.

### SD5 — Copy-to-clipboard fails gracefully

`navigator.clipboard.writeText` requires HTTPS in production browsers. In dev (HTTP localhost) it works. The catch block logs to console + shows "No se pudo copiar" instead of throwing.

### SD6 — `AuditLogRow.actorUserId` displayed as truncated UUID, not username

The endpoint doesn't currently join users; the actor displays as the raw UUID. `m2-audit-log-ui-actor-name-resolution` is filed for resolving UUIDs to display names via a join.

## Test strategy

**ui-kit (vitest):**

- `AuditLogTable.test.tsx` — 5 tests:
  1. Empty rows render the empty state.
  2. Loading + empty renders skeleton rows.
  3. Rows render in the expected column order.
  4. Click row triggers `onToggleExpand` with the row id.
  5. Expanded row renders `<AuditLogRowDetail>` inline.
- `AuditLogRowDetail.test.tsx` — 4 tests:
  1. Renders both payload columns when present.
  2. Renders empty state placeholders when `null`.
  3. Renders citation link as `<a target="_blank" rel="noopener noreferrer">`.
  4. Copy-button calls `navigator.clipboard.writeText` (spy).
- `AuditLogFilters.test.tsx` — 6 tests:
  1. Renders with default values.
  2. Toggling event-type checkbox calls onChange.
  3. Apply calls onApply.
  4. Reset calls onReset (form clears via parent).
  5. Export CSV calls onExportCsv.
  6. Date range invalid (since > until) shows inline warning (or relies on server 422 — pick one in implementation).

**apps/web (vitest):**

- `AuditLogScreen.test.tsx` — 5 tests:
  1. Owner sees rows.
  2. Manager sees rows (any-of role guard).
  3. Staff sees access-denied fallback + zero fetches fire.
  4. Apply with new filter refetches.
  5. Load-more clicks increment offset + append rows.

**Storybook stories**: 4 (AuditLogTable: Empty / Filled / Loading / Expanded; AuditLogRowDetail: WithPayloads / EmptyPayloads; AuditLogFilters: Default / WithSelections).

## Out-of-scope follow-ups

Listed in proposal.md `Filed follow-ups`. Notable: `m2-audit-log-ui-aggregate-deeplink`, `m2-audit-log-ui-fts-highlight`, `m2-audit-log-ui-realtime`, `m2-audit-log-ui-saved-views`, `m2-audit-log-ui-url-sync`, `m2-audit-log-ui-large-payload-fold`, `m2-audit-log-ui-actor-name-resolution`, `m2-audit-log-ui-dynamic-types`, `m2-audit-log-ui-virtualisation`.
