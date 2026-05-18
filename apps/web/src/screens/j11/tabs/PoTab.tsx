import { useMemo, useState } from 'react';
import {
  useCreatePurchaseOrder,
  usePurchaseOrders,
} from '../../../hooks/useProcurement';
import { useSuppliersQuery } from '../../../hooks/useSuppliers';
import { useLocationsQuery } from '../../../hooks/useLocations';
import { useIngredientsListQuery } from '../../../hooks/useIngredients';
import { useCurrentRole } from '../../../lib/currentUser';
import {
  PO_STATES,
  type CreatePoLinePayload,
  type PoListItem,
  type PoState,
} from '../../../api/procurement';
import { EmptyState, ErrorBox, Loading } from './shared';
import { PoDetailDrawer } from './PoDetailDrawer';

/**
 * j11 Procurement — Órdenes de compra tab.
 *
 * Sprint 4 W3-batch2-A bundles 4 features on this surface:
 *  - W3-11 — `Nueva OC` primary CTA (Owner-only) opens a 4-step modal
 *    wizard (supplier → location → lines → review). On submit it calls
 *    `POST /m3/procurement/po`, toasts "OC #X creada" and pre-warms the
 *    detail-drawer cache so opening the new PO is instant.
 *  - W3-12 — tablet-friendly rows: min-h ≥64 px, full-row click target,
 *    keyboard accessible, drawer buttons ≥48 px high.
 *  - W3-9 — filter chip group (location · proveedor · estado) sits above
 *    the table. Filters thread through `usePurchaseOrders` into the
 *    `GET /m3/procurement/po` query params.
 *  - W3-8 — audit chip per row (mute link `audit_log AL-... · ver chain →`)
 *    routing to `/audit-log?aggregate_id=<poId>`.
 */
const STATE_LABELS: Record<PoState, string> = {
  draft: 'Borrador',
  sent: 'Enviada',
  partially_received: 'Parcialmente recibida',
  received: 'Recibida',
  closed: 'Cerrada',
  cancelled: 'Cancelada',
};

export function PoTab({ orgId }: { orgId: string }) {
  const role = useCurrentRole();
  const [supplierIds, setSupplierIds] = useState<string[]>([]);
  const [locationIds, setLocationIds] = useState<string[]>([]);
  const [state, setState] = useState<PoState | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const filters = useMemo(
    () => ({ supplierIds, locationIds, state }),
    [supplierIds, locationIds, state],
  );
  const query = usePurchaseOrders(orgId, filters);
  const rows = useMemo(() => query.data?.items ?? [], [query.data]);

  const hasActiveFilter =
    supplierIds.length > 0 || locationIds.length > 0 || state !== null;

  const resetFilters = () => {
    setSupplierIds([]);
    setLocationIds([]);
    setState(null);
  };

  const onCreated = (poNumber: string) => {
    setToast(`OC ${poNumber} creada`);
    setShowCreate(false);
    window.setTimeout(() => setToast(null), 4000);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <FilterBar
          orgId={orgId}
          supplierIds={supplierIds}
          locationIds={locationIds}
          state={state}
          onChangeSupplierIds={setSupplierIds}
          onChangeLocationIds={setLocationIds}
          onChangeState={setState}
          hasActiveFilter={hasActiveFilter}
          onReset={resetFilters}
        />
        {role === 'OWNER' && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            data-testid="po-new-cta"
            className="inline-flex min-h-[48px] items-center justify-center rounded-md bg-(--color-accent) px-4 py-2 text-sm font-semibold text-(--color-accent-on) shadow-sm hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
          >
            Nueva OC
          </button>
        )}
      </div>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-ink"
        >
          {toast}
        </div>
      )}

      {query.isPending && <Loading label="Cargando órdenes de compra…" />}
      {query.error && <ErrorBox message={query.error.message} />}
      {!query.isPending && !query.error && rows.length === 0 && (
        <EmptyState
          title={
            hasActiveFilter
              ? 'No hay órdenes que coincidan con los filtros'
              : 'Aún no hay órdenes de compra activas'
          }
          body={
            hasActiveFilter
              ? 'Ajusta o limpia los filtros para ver más resultados.'
              : 'Cuando envíes una OC a un proveedor aparecerá aquí, con su estado (enviada · parcialmente recibida · cerrada) y el total. Pulsa «Nueva OC» para crear la primera.'
          }
        />
      )}
      {!query.isPending && !query.error && rows.length > 0 && (
        <PoTable rows={rows} onSelect={setSelectedId} />
      )}

      {selectedId && (
        <PoDetailDrawer
          orgId={orgId}
          poId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}

      {showCreate && (
        <NewPoModal
          orgId={orgId}
          onCancel={() => setShowCreate(false)}
          onCreated={onCreated}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* W3-9 — filter chip group                                                   */
/* -------------------------------------------------------------------------- */

function FilterBar({
  orgId,
  supplierIds,
  locationIds,
  state,
  onChangeSupplierIds,
  onChangeLocationIds,
  onChangeState,
  hasActiveFilter,
  onReset,
}: {
  orgId: string;
  supplierIds: string[];
  locationIds: string[];
  state: PoState | null;
  onChangeSupplierIds: (next: string[]) => void;
  onChangeLocationIds: (next: string[]) => void;
  onChangeState: (next: PoState | null) => void;
  hasActiveFilter: boolean;
  onReset: () => void;
}) {
  const suppliers = useSuppliersQuery(orgId);
  const locations = useLocationsQuery(orgId);

  const supplierOptions = useMemo(
    () => suppliers.data?.map((s) => ({ value: s.id, label: s.name })) ?? [],
    [suppliers.data],
  );
  const locationOptions = useMemo(
    () => locations.data?.map((l) => ({ value: l.id, label: l.name })) ?? [],
    [locations.data],
  );

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="po-filter-bar">
      <ChipMultiSelect
        label="Proveedor"
        ariaLabel="Filtrar por proveedor"
        options={supplierOptions}
        selected={supplierIds}
        onChange={onChangeSupplierIds}
      />
      <ChipMultiSelect
        label="Ubicación"
        ariaLabel="Filtrar por ubicación"
        options={locationOptions}
        selected={locationIds}
        onChange={onChangeLocationIds}
      />
      <ChipSingleSelect
        label="Estado"
        ariaLabel="Filtrar por estado"
        options={PO_STATES.map((s) => ({ value: s, label: STATE_LABELS[s] }))}
        selected={state}
        onChange={(v) => onChangeState(v as PoState | null)}
      />
      {hasActiveFilter && (
        <button
          type="button"
          onClick={onReset}
          className="text-sm text-(--color-accent) underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
          data-testid="po-filter-reset"
        >
          Limpiar filtros
        </button>
      )}
    </div>
  );
}

function ChipMultiSelect({
  label,
  ariaLabel,
  options,
  selected,
  onChange,
}: {
  label: string;
  ariaLabel: string;
  options: Array<{ value: string; label: string }>;
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const summary =
    selected.length === 0
      ? label
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? label)
        : `${label} (${selected.length})`;
  const active = selected.length > 0;
  return (
    <details className="relative">
      <summary
        aria-label={ariaLabel}
        className={
          active
            ? 'inline-flex cursor-pointer items-center gap-1 rounded-full border border-(--color-accent) bg-(--color-accent)/10 px-3 py-1 text-sm font-medium text-(--color-accent) focus:outline-none focus:ring-2 focus:ring-(--color-focus)'
            : 'inline-flex cursor-pointer items-center gap-1 rounded-full border border-border-strong bg-surface px-3 py-1 text-sm text-mute hover:text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)'
        }
      >
        <span>{summary}</span>
        <span aria-hidden="true">▾</span>
      </summary>
      <div
        role="group"
        aria-label={ariaLabel}
        className="absolute z-20 mt-1 max-h-64 w-56 overflow-auto rounded-md border border-border-strong bg-surface p-2 text-sm shadow-lg"
      >
        {options.length === 0 ? (
          <p className="px-1 py-2 text-mute">Sin opciones disponibles.</p>
        ) : (
          options.map((opt) => {
            const checked = selected.includes(opt.value);
            return (
              <label
                key={opt.value}
                className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-ink hover:bg-(--color-surface-strong)"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    if (checked) {
                      onChange(selected.filter((v) => v !== opt.value));
                    } else {
                      onChange([...selected, opt.value]);
                    }
                  }}
                  className="h-4 w-4 accent-(--color-accent)"
                />
                <span>{opt.label}</span>
              </label>
            );
          })
        )}
      </div>
    </details>
  );
}

function ChipSingleSelect({
  label,
  ariaLabel,
  options,
  selected,
  onChange,
}: {
  label: string;
  ariaLabel: string;
  options: Array<{ value: string; label: string }>;
  selected: string | null;
  onChange: (next: string | null) => void;
}) {
  const summary = selected
    ? (options.find((o) => o.value === selected)?.label ?? label)
    : label;
  const active = selected !== null;
  return (
    <details className="relative">
      <summary
        aria-label={ariaLabel}
        className={
          active
            ? 'inline-flex cursor-pointer items-center gap-1 rounded-full border border-(--color-accent) bg-(--color-accent)/10 px-3 py-1 text-sm font-medium text-(--color-accent) focus:outline-none focus:ring-2 focus:ring-(--color-focus)'
            : 'inline-flex cursor-pointer items-center gap-1 rounded-full border border-border-strong bg-surface px-3 py-1 text-sm text-mute hover:text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)'
        }
      >
        <span>{summary}</span>
        <span aria-hidden="true">▾</span>
      </summary>
      <div
        role="radiogroup"
        aria-label={ariaLabel}
        className="absolute z-20 mt-1 max-h-64 w-56 overflow-auto rounded-md border border-border-strong bg-surface p-2 text-sm shadow-lg"
      >
        <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-mute hover:bg-(--color-surface-strong)">
          <input
            type="radio"
            name={`chip-${label}`}
            checked={selected === null}
            onChange={() => onChange(null)}
            className="h-4 w-4 accent-(--color-accent)"
          />
          <span>(todos)</span>
        </label>
        {options.map((opt) => (
          <label
            key={opt.value}
            className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-ink hover:bg-(--color-surface-strong)"
          >
            <input
              type="radio"
              name={`chip-${label}`}
              checked={selected === opt.value}
              onChange={() => onChange(opt.value)}
              className="h-4 w-4 accent-(--color-accent)"
            />
            <span>{opt.label}</span>
          </label>
        ))}
      </div>
    </details>
  );
}

/* -------------------------------------------------------------------------- */
/* W3-12 — tablet-friendly rows (min-h ≥64 px, full-row click target)         */
/* W3-8 — audit chip per row routing to /audit-log?aggregate_id=              */
/* -------------------------------------------------------------------------- */

function PoTable({
  rows,
  onSelect,
}: {
  rows: PoListItem[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-border-strong">
      <table className="min-w-full divide-y divide-border-strong text-sm">
        <thead className="bg-surface text-left text-xs font-semibold uppercase tracking-wide text-mute">
          <tr>
            <th className="px-3 py-2">PO#</th>
            <th className="px-3 py-2">Estado</th>
            <th className="px-3 py-2">Entrega prevista</th>
            <th className="px-3 py-2 text-right">Total</th>
            <th className="px-3 py-2 text-right">Auditoría</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-strong">
          {rows.map((row) => (
            <tr
              key={row.id}
              data-testid="po-row"
              tabIndex={0}
              role="button"
              aria-label={`Abrir ${row.poNumber}`}
              onClick={() => onSelect(row.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(row.id);
                }
              }}
              className="min-h-[64px] cursor-pointer text-ink hover:bg-(--color-surface-strong) focus-within:bg-(--color-surface-strong) focus:outline-none focus:ring-2 focus:ring-inset focus:ring-(--color-focus)"
            >
              <td className="min-h-[64px] px-3 py-3 font-medium text-(--color-accent)">
                {row.poNumber}
              </td>
              <td className="min-h-[64px] px-3 py-3">
                {STATE_LABELS[row.state as PoState] ?? row.state}
              </td>
              <td className="min-h-[64px] px-3 py-3">
                {row.expectedDeliveryDate ?? '—'}
              </td>
              <td className="min-h-[64px] px-3 py-3 text-right tabular-nums">
                {row.total.toFixed(2)} {row.currency}
              </td>
              <td className="min-h-[64px] px-3 py-3 text-right">
                <AuditChip aggregateId={row.id} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * W3-8 — audit chip. Routes to `/audit-log?aggregate_id=<poId>`. The
 * displayed `AL-<id>` token is the short-hand the audit-log screen surfaces
 * once it lands the `aggregate_id` filter param (followup on that screen);
 * for now this is a discoverable cross-link that operators can copy/paste.
 *
 * `stopPropagation` on click keeps the chip from also opening the drawer.
 */
function AuditChip({ aggregateId }: { aggregateId: string }) {
  const short = aggregateId.slice(0, 8).toUpperCase();
  return (
    <a
      href={`/audit-log?aggregate_id=${encodeURIComponent(aggregateId)}`}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      className="text-xs text-mute underline-offset-2 hover:text-ink hover:underline focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
      data-testid="po-audit-chip"
    >
      audit_log AL-{short} · ver chain →
    </a>
  );
}

/* -------------------------------------------------------------------------- */
/* W3-11 — Nueva OC modal (4-step wizard)                                     */
/* -------------------------------------------------------------------------- */

type WizardStep = 1 | 2 | 3 | 4;

interface DraftLine {
  ingredientId: string;
  quantityOrdered: string;
  unit: string;
  unitPrice: string;
}

const UNITS = ['kg', 'g', 'L', 'ml', 'un'] as const;

function NewPoModal({
  orgId,
  onCancel,
  onCreated,
}: {
  orgId: string;
  onCancel: () => void;
  onCreated: (poNumber: string) => void;
}) {
  const [step, setStep] = useState<WizardStep>(1);
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const suppliers = useSuppliersQuery(orgId);
  const locations = useLocationsQuery(orgId);
  const ingredients = useIngredientsListQuery(orgId);
  const createMutation = useCreatePurchaseOrder(orgId);

  const canNext1 = supplierId !== null;
  const canNext2 = locationId !== null;
  const canNext3 = useMemo(
    () =>
      lines.length > 0 &&
      lines.every(
        (l) =>
          l.ingredientId.length > 0 &&
          Number.isFinite(Number(l.quantityOrdered)) &&
          Number(l.quantityOrdered) > 0 &&
          UNITS.includes(l.unit as (typeof UNITS)[number]) &&
          Number.isFinite(Number(l.unitPrice)) &&
          Number(l.unitPrice) >= 0,
      ),
    [lines],
  );

  const totalEstimated = useMemo(
    () =>
      lines.reduce((sum, l) => {
        const q = Number(l.quantityOrdered);
        const p = Number(l.unitPrice);
        if (Number.isFinite(q) && Number.isFinite(p)) return sum + q * p;
        return sum;
      }, 0),
    [lines],
  );

  const submit = async () => {
    if (!supplierId) return;
    setSubmitError(null);
    const payloadLines: CreatePoLinePayload[] = lines.map((l) => ({
      ingredientId: l.ingredientId,
      quantityOrdered: Number(l.quantityOrdered),
      unit: l.unit,
      unitPrice: Number(l.unitPrice),
      vatRate: 0.1,
      vatInclusive: false,
    }));
    try {
      const detail = await createMutation.mutateAsync({
        supplierId,
        currency: 'EUR',
        locationId: locationId ?? undefined,
        lines: payloadLines,
      });
      onCreated(detail.poNumber);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Error al crear la OC',
      );
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-po-title"
    >
      <button
        type="button"
        aria-label="Cancelar"
        onClick={onCancel}
        className="absolute inset-0 bg-ink/40"
      />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-surface shadow-xl">
        <header className="flex items-start justify-between gap-3 border-b border-border-strong px-5 py-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-mute">
              Paso {step} de 4
            </p>
            <h3
              id="new-po-title"
              className="mt-1 text-lg font-semibold text-ink"
            >
              Nueva orden de compra
            </h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancelar"
            className="min-h-[48px] min-w-[48px] rounded p-2 text-mute hover:bg-(--color-surface-strong) hover:text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {step === 1 && (
            <Step1Supplier
              suppliers={suppliers.data ?? []}
              loading={suppliers.isPending}
              selected={supplierId}
              onChange={setSupplierId}
            />
          )}
          {step === 2 && (
            <Step2Location
              locations={locations.data ?? []}
              loading={locations.isPending}
              selected={locationId}
              onChange={setLocationId}
            />
          )}
          {step === 3 && (
            <Step3Lines
              lines={lines}
              ingredients={
                ingredients.data?.map((i) => ({ id: i.id, name: i.name })) ?? []
              }
              loading={ingredients.isPending}
              onChange={setLines}
            />
          )}
          {step === 4 && (
            <Step4Review
              supplierName={
                suppliers.data?.find((s) => s.id === supplierId)?.name ?? '—'
              }
              locationName={
                locations.data?.find((l) => l.id === locationId)?.name ?? '—'
              }
              lines={lines}
              ingredients={
                ingredients.data?.map((i) => ({ id: i.id, name: i.name })) ?? []
              }
              total={totalEstimated}
            />
          )}
          {submitError && (
            <p
              role="alert"
              className="mt-3 rounded border border-(--color-danger-fg) bg-surface px-3 py-2 text-sm text-(--color-danger-fg)"
            >
              {submitError}
            </p>
          )}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-border-strong px-5 py-4">
          <button
            type="button"
            onClick={() => (step === 1 ? onCancel() : setStep((s) => (s - 1) as WizardStep))}
            className="min-h-[48px] rounded-md border border-border-strong px-4 py-2 text-sm font-medium text-mute hover:text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
          >
            {step === 1 ? 'Cancelar' : 'Atrás'}
          </button>
          {step < 4 ? (
            <button
              type="button"
              disabled={
                (step === 1 && !canNext1) ||
                (step === 2 && !canNext2) ||
                (step === 3 && !canNext3)
              }
              onClick={() => setStep((s) => (s + 1) as WizardStep)}
              data-testid="po-wizard-next"
              className="min-h-[48px] rounded-md bg-(--color-accent) px-4 py-2 text-sm font-semibold text-(--color-accent-on) shadow-sm hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-(--color-focus) disabled:cursor-not-allowed disabled:opacity-50"
            >
              Siguiente
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={createMutation.isPending || !canNext3}
              data-testid="po-wizard-submit"
              className="min-h-[48px] rounded-md bg-(--color-accent) px-4 py-2 text-sm font-semibold text-(--color-accent-on) shadow-sm hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-(--color-focus) disabled:cursor-not-allowed disabled:opacity-50"
            >
              {createMutation.isPending ? 'Creando…' : 'Crear OC'}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

function emptyLine(): DraftLine {
  return { ingredientId: '', quantityOrdered: '', unit: 'kg', unitPrice: '' };
}

function Step1Supplier({
  suppliers,
  loading,
  selected,
  onChange,
}: {
  suppliers: Array<{ id: string; name: string }>;
  loading: boolean;
  selected: string | null;
  onChange: (id: string | null) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-ink" htmlFor="po-wiz-supplier">
        Proveedor
      </label>
      {loading ? (
        <p className="text-sm text-mute">Cargando proveedores…</p>
      ) : suppliers.length === 0 ? (
        <p className="text-sm text-mute">
          No hay proveedores. Crea uno en Ajustes → Proveedores antes de
          continuar.
        </p>
      ) : (
        <select
          id="po-wiz-supplier"
          value={selected ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
          className="min-h-[48px] w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
        >
          <option value="">Selecciona un proveedor…</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function Step2Location({
  locations,
  loading,
  selected,
  onChange,
}: {
  locations: Array<{ id: string; name: string }>;
  loading: boolean;
  selected: string | null;
  onChange: (id: string | null) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-ink" htmlFor="po-wiz-location">
        Ubicación de entrega
      </label>
      {loading ? (
        <p className="text-sm text-mute">Cargando ubicaciones…</p>
      ) : locations.length === 0 ? (
        <p className="text-sm text-mute">
          No hay ubicaciones. Crea una en Ajustes antes de continuar.
        </p>
      ) : (
        <select
          id="po-wiz-location"
          value={selected ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
          className="min-h-[48px] w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
        >
          <option value="">Selecciona una ubicación…</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function Step3Lines({
  lines,
  ingredients,
  loading,
  onChange,
}: {
  lines: DraftLine[];
  ingredients: Array<{ id: string; name: string }>;
  loading: boolean;
  onChange: (lines: DraftLine[]) => void;
}) {
  const updateLine = (idx: number, patch: Partial<DraftLine>) => {
    onChange(lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };
  const removeLine = (idx: number) => {
    onChange(lines.filter((_, i) => i !== idx));
  };
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium text-ink">Líneas de la OC</h4>
      {loading && <p className="text-sm text-mute">Cargando ingredientes…</p>}
      <ul className="space-y-3">
        {lines.map((line, idx) => (
          <li
            key={idx}
            className="rounded-md border border-border-strong bg-surface p-3"
            data-testid="po-wizard-line"
          >
            <div className="grid grid-cols-1 gap-2 md:grid-cols-12">
              <select
                aria-label={`Ingrediente línea ${idx + 1}`}
                value={line.ingredientId}
                onChange={(e) => updateLine(idx, { ingredientId: e.target.value })}
                className="min-h-[48px] rounded-md border border-border-strong bg-surface px-2 py-1 text-sm text-ink md:col-span-5"
              >
                <option value="">Ingrediente…</option>
                {ingredients.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
              <input
                aria-label={`Cantidad línea ${idx + 1}`}
                type="number"
                min="0"
                step="0.001"
                value={line.quantityOrdered}
                onChange={(e) =>
                  updateLine(idx, { quantityOrdered: e.target.value })
                }
                placeholder="Cant."
                className="min-h-[48px] rounded-md border border-border-strong bg-surface px-2 py-1 text-right text-sm text-ink tabular-nums md:col-span-2"
              />
              <select
                aria-label={`Unidad línea ${idx + 1}`}
                value={line.unit}
                onChange={(e) => updateLine(idx, { unit: e.target.value })}
                className="min-h-[48px] rounded-md border border-border-strong bg-surface px-2 py-1 text-sm text-ink md:col-span-2"
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
              <input
                aria-label={`Precio unitario línea ${idx + 1}`}
                type="number"
                min="0"
                step="0.01"
                value={line.unitPrice}
                onChange={(e) => updateLine(idx, { unitPrice: e.target.value })}
                placeholder="€"
                className="min-h-[48px] rounded-md border border-border-strong bg-surface px-2 py-1 text-right text-sm text-ink tabular-nums md:col-span-2"
              />
              <button
                type="button"
                onClick={() => removeLine(idx)}
                disabled={lines.length === 1}
                aria-label={`Eliminar línea ${idx + 1}`}
                className="min-h-[48px] rounded-md border border-border-strong px-2 py-1 text-sm text-mute hover:text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus) disabled:opacity-30 md:col-span-1"
              >
                ×
              </button>
            </div>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => onChange([...lines, emptyLine()])}
        className="min-h-[48px] rounded-md border border-dashed border-border-strong px-3 py-2 text-sm text-mute hover:text-ink focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
        data-testid="po-wizard-add-line"
      >
        + Añadir línea
      </button>
    </div>
  );
}

function Step4Review({
  supplierName,
  locationName,
  lines,
  ingredients,
  total,
}: {
  supplierName: string;
  locationName: string;
  lines: DraftLine[];
  ingredients: Array<{ id: string; name: string }>;
  total: number;
}) {
  const nameOf = (id: string) =>
    ingredients.find((i) => i.id === id)?.name ?? '—';
  return (
    <div className="space-y-4 text-sm text-ink">
      <section className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-mute">Proveedor</p>
          <p className="mt-1">{supplierName}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-mute">
            Ubicación
          </p>
          <p className="mt-1">{locationName}</p>
        </div>
      </section>
      <section>
        <h4 className="mb-2 text-sm font-medium text-ink">Líneas</h4>
        <div className="overflow-x-auto rounded-md border border-border-strong">
          <table className="min-w-full divide-y divide-border-strong">
            <thead className="bg-surface text-left text-xs font-semibold uppercase tracking-wide text-mute">
              <tr>
                <th className="px-3 py-2">Producto</th>
                <th className="px-3 py-2 text-right">Cant.</th>
                <th className="px-3 py-2">Unidad</th>
                <th className="px-3 py-2 text-right">Precio</th>
                <th className="px-3 py-2 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-strong">
              {lines.map((l, idx) => {
                const sub = Number(l.quantityOrdered) * Number(l.unitPrice);
                return (
                  <tr key={idx} className="text-ink">
                    <td className="px-3 py-2">{nameOf(l.ingredientId)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {l.quantityOrdered}
                    </td>
                    <td className="px-3 py-2">{l.unit}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {Number(l.unitPrice).toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {Number.isFinite(sub) ? sub.toFixed(2) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <section className="rounded-md border border-border-strong bg-surface px-4 py-3">
        <div className="flex items-center justify-between text-base font-semibold">
          <span>Total estimado</span>
          <span className="tabular-nums">{total.toFixed(2)} EUR</span>
        </div>
        <p className="mt-1 text-xs text-mute">
          IVA por defecto 10% (ajustable post-creación en futuras iteraciones).
        </p>
      </section>
    </div>
  );
}
