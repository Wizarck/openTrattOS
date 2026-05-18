import { useEffect } from 'react';
import { usePurchaseOrder } from '../../../hooks/useProcurement';
import { ErrorBox, Loading } from './shared';

/**
 * j11 PO detail drawer (Sprint 4 W3-1; W3-batch2-A bundles W3-8 + W3-12).
 *
 * Spec: docs/ux/j11.md §3 — click PO row → drawer mounts on right
 * (full-page on phone). Shows header (proveedor · dirección · fecha ·
 * PO#) · líneas table (producto · cantidad · unidad · precio unit ·
 * subtotal) · footer (subtotal · IVA · total). State-aware action
 * buttons land in Phase 3 of this slice.
 *
 * Close affordances: X button, Escape key, overlay click. All interactive
 * controls inside the drawer are sized ≥48 px tall (W3-12 tablet rule).
 * Footer carries the audit chip routing to /audit-log?aggregate_id= (W3-8).
 *
 * SHELL ONLY — does NOT yet render:
 *   FOLLOWUP — supplier display name + address (today only supplier_id
 *   is surfaced; resolve via suppliers cache once the suppliers list
 *   query is wired into this screen), ingredient display name (same
 *   pattern), Hermes pre-fill banner, Cancelar / Cerrar buttons (Phase 3).
 */
export function PoDetailDrawer({
  orgId,
  poId,
  onClose,
}: {
  orgId: string;
  poId: string;
  onClose: () => void;
}) {
  const query = usePurchaseOrder(orgId, poId);

  // Escape key closes the drawer. Tab focus trap is intentionally out of
  // scope for the MVP — followup if the j11 polish pass flags it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const detail = query.data;

  return (
    <div
      className="fixed inset-0 z-40 flex"
      role="dialog"
      aria-modal="true"
      aria-labelledby="po-drawer-title"
    >
      {/* Overlay — click-to-close. Keyboard users get Escape (above). */}
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 bg-ink/40"
      />
      <aside
        className="relative ml-auto flex h-full w-full max-w-xl flex-col overflow-y-auto bg-surface shadow-xl"
        data-testid="po-detail-drawer"
      >
        <header className="flex items-start justify-between gap-4 border-b border-border-strong px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-mute">
              Orden de compra
            </p>
            <h3
              id="po-drawer-title"
              className="mt-1 truncate text-lg font-semibold text-ink"
            >
              {detail?.poNumber ?? '…'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="min-h-[48px] min-w-[48px] rounded p-2 text-mute hover:bg-(--color-surface-strong) hover:text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <div className="flex-1 space-y-5 px-5 py-5">
          {query.isPending && <Loading label="Cargando detalle…" />}
          {query.error && <ErrorBox message={query.error.message} />}
          {detail && <PoDrawerBody detail={detail} />}
        </div>

        {detail && (
          <footer className="flex items-center justify-between gap-3 border-t border-border-strong px-5 py-3 text-sm">
            <PoAuditChip aggregateId={detail.id} />
            <button
              type="button"
              onClick={onClose}
              className="min-h-[48px] rounded-md border border-border-strong px-4 py-2 text-sm font-medium text-mute hover:text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
            >
              Cerrar
            </button>
          </footer>
        )}
      </aside>
    </div>
  );
}

/**
 * W3-8 — audit chip in drawer footer. Mirrors the per-row chip in PoTab.
 * Routes to `/audit-log?aggregate_id=<poId>` so the operator can jump
 * straight to the hash-chain view for this PO.
 */
function PoAuditChip({ aggregateId }: { aggregateId: string }) {
  const short = aggregateId.slice(0, 8).toUpperCase();
  return (
    <a
      href={`/audit-log?aggregate_id=${encodeURIComponent(aggregateId)}`}
      className="text-xs text-mute underline-offset-2 hover:text-ink hover:underline focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
      data-testid="po-drawer-audit-chip"
    >
      audit_log AL-{short} · ver chain →
    </a>
  );
}

function PoDrawerBody({
  detail,
}: {
  detail: NonNullable<ReturnType<typeof usePurchaseOrder>['data']>;
}) {
  return (
    <>
      <section
        aria-label="Resumen"
        className="grid grid-cols-2 gap-3 text-sm text-ink"
      >
        <Field label="Proveedor" value={detail.supplierId} />
        <Field label="Estado" value={detail.state} />
        <Field
          label="Entrega prevista"
          value={detail.expectedDeliveryDate ?? '—'}
        />
        <Field
          label="Creada"
          value={new Date(detail.createdAt).toLocaleDateString('es-ES')}
        />
      </section>

      <section aria-label="Líneas">
        <h4 className="mb-2 text-sm font-semibold text-ink">Líneas</h4>
        <div className="overflow-x-auto rounded-md border border-border-strong">
          <table className="min-w-full divide-y divide-border-strong text-sm">
            <thead className="bg-surface text-left text-xs font-semibold uppercase tracking-wide text-mute">
              <tr>
                <th className="px-3 py-2">Producto</th>
                <th className="px-3 py-2 text-right">Cant.</th>
                <th className="px-3 py-2">Unidad</th>
                <th className="px-3 py-2 text-right">Precio unit.</th>
                <th className="px-3 py-2 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-strong">
              {detail.lines.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-3 text-center text-mute"
                  >
                    Esta OC no tiene líneas registradas.
                  </td>
                </tr>
              ) : (
                detail.lines.map((line) => (
                  <tr key={line.id} className="text-ink">
                    <td className="px-3 py-2 font-medium">
                      {line.ingredientId}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {line.quantityOrdered}
                    </td>
                    <td className="px-3 py-2">{line.unit}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {line.unitPrice.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {line.lineSubtotal.toFixed(2)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section
        aria-label="Totales"
        className="rounded-md border border-border-strong bg-surface px-4 py-3 text-sm text-ink"
      >
        <Row
          label="Subtotal"
          value={`${detail.subtotal.toFixed(2)} ${detail.currency}`}
        />
        <Row
          label="IVA"
          value={`${detail.vatTotal.toFixed(2)} ${detail.currency}`}
        />
        <Row
          label="Total"
          value={`${detail.total.toFixed(2)} ${detail.currency}`}
          emphasis
        />
      </section>
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-mute">{label}</p>
      <p className="mt-1 truncate text-sm text-ink">{value}</p>
    </div>
  );
}

function Row({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={
        emphasis
          ? 'mt-2 flex items-center justify-between border-t border-border-strong pt-2 text-base font-semibold'
          : 'flex items-center justify-between py-1'
      }
    >
      <span className={emphasis ? 'text-ink' : 'text-mute'}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
