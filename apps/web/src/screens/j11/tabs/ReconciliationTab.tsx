import { useMemo, useState } from 'react';
import { useReconciliation } from '../../../hooks/useProcurement';
import { useCurrentRole } from '../../../lib/currentUser';
import type { ReconciliationListItem } from '../../../api/procurement';
import { EmptyState, ErrorBox, Loading } from './shared';
import { ReconciliationDrawer } from './ReconciliationDrawer';

/**
 * j11 Procurement — Reconciliación tab.
 *
 * Backend aggregate landed in PR #226 (entity + migration) + PR #227
 * (repository + detector + service + real controller). Sprint 4 W3-6
 * adds the resolution drawer (this commit): each row is clickable and
 * opens a side-panel sheet with the side-by-side PO-vs-GR diff and the
 * three resolution actions (Aceptar diferencia · Solicitar nota de
 * crédito · Devolver). Owner approval gate enforces Manager
 * disabled-state on material discrepancies (j11 §6).
 *
 * REMAINING FOLLOWUPS (Sprint 4 Wave 3+):
 *  - `request-owner-approval` endpoint + email-based escalation flow
 *  - Audit chip per row → /audit-log?aggregate_id=
 *  - Filter chips (state · supplier · discrepancy type)
 *  - GR draft creation on `Devolver` (currently state change only)
 */
export function ReconciliationTab({ orgId }: { orgId: string }) {
  const query = useReconciliation(orgId);
  const role = useCurrentRole();
  const rows = useMemo(() => query.data?.items ?? [], [query.data]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = useMemo(
    () => rows.find((r) => r.id === selectedId) ?? null,
    [rows, selectedId],
  );

  if (query.isPending) return <Loading label="Cargando reconciliaciones…" />;
  if (query.error) return <ErrorBox message={query.error.message} />;
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Aún no hay reconciliaciones abiertas"
        body="Cuando una recepción no cuadre con su OC (cantidad, precio, producto o lote no conforme) abriremos una reconciliación aquí. Tap en cualquier fila abre el drawer con la comparación PO-vs-GR y las acciones de resolución."
      />
    );
  }
  return (
    <>
      <ReconciliationTable
        rows={rows}
        onRowClick={(row) => setSelectedId(row.id)}
      />
      {selected !== null && (
        <ReconciliationDrawer
          row={selected}
          role={role}
          orgId={orgId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </>
  );
}

const DISCREPANCY_LABELS: Record<
  ReconciliationListItem['discrepancyType'],
  string
> = {
  cantidad: 'Cantidad',
  precio: 'Precio',
  producto: 'Producto',
  'lote-no-conforme': 'Lote no conforme',
};

const STATE_LABELS: Record<ReconciliationListItem['state'], string> = {
  abierta: 'Abierta',
  aceptada: 'Aceptada',
  'nota-credito': 'Nota de crédito',
  devuelta: 'Devuelta',
};

function ReconciliationTable({
  rows,
  onRowClick,
}: {
  rows: ReconciliationListItem[];
  onRowClick: (row: ReconciliationListItem) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-border-strong">
      <table className="min-w-full divide-y divide-border-strong text-sm">
        <thead className="bg-surface text-left text-xs font-semibold uppercase tracking-wide text-mute">
          <tr>
            <th className="px-3 py-2">PO#</th>
            <th className="px-3 py-2">Discrepancia</th>
            <th className="px-3 py-2">Diff</th>
            <th className="px-3 py-2">Estado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-strong">
          {rows.map((row) => (
            <tr
              key={row.id}
              data-testid="reconciliation-row"
              data-row-id={row.id}
              tabIndex={0}
              role="button"
              aria-label={`Abrir reconciliación ${row.poNumber ?? 'sin OC'}`}
              onClick={() => onRowClick(row)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onRowClick(row);
                }
              }}
              className="cursor-pointer text-ink hover:bg-surface focus:bg-surface focus:outline-none focus:ring-2 focus:ring-inset focus:ring-(--color-focus)"
            >
              <td className="px-3 py-2 font-medium">
                {row.poNumber ?? '—'}
              </td>
              <td className="px-3 py-2">
                {DISCREPANCY_LABELS[row.discrepancyType]}
              </td>
              <td className="px-3 py-2 font-mono text-xs text-mute">
                {formatDiffSummary(row)}
              </td>
              <td className="px-3 py-2">{STATE_LABELS[row.state]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * One-line preview of the diff column for the list view. Drawer holds
 * the full side-by-side. Keep terse so the table stays scannable.
 */
function formatDiffSummary(row: ReconciliationListItem): string {
  const d = row.diff;
  const fmt = (v: unknown) =>
    v === null || v === undefined ? '—' : String(v);
  switch (row.discrepancyType) {
    case 'cantidad':
      return `${fmt(d['expectedQty'])} → ${fmt(d['actualQty'])} ${fmt(d['unit'])}`.trim();
    case 'precio':
      return `${fmt(d['expectedUnitPrice'])} → ${fmt(d['actualUnitPrice'])} ${fmt(d['currency'])}`.trim();
    case 'producto':
      return `SKU ≠`;
    case 'lote-no-conforme':
      return `Lote ${fmt(d['lotId'])}`;
  }
}
