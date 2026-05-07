import { cn } from '../../lib/cn';
import {
  AUDIT_ACTOR_KINDS,
  KNOWN_AUDIT_AGGREGATE_TYPES,
  KNOWN_AUDIT_EVENT_TYPES,
  type AuditActorKind,
  type AuditLogFiltersProps,
} from './AuditLogFilters.types';

/**
 * Controlled filter form for the audit_log browse UI. Form state lives in
 * the consumer; this component only renders inputs and surfaces change
 * events. The "Apply" button gives the consumer a single point to
 * commit-and-fetch (so toggling many checkboxes doesn't fan out into a
 * fetch storm — see design SD3).
 */
export function AuditLogFilters({
  values,
  onChange,
  onApply,
  onReset,
  onExportCsv,
  applying = false,
}: AuditLogFiltersProps) {
  const toggleEventType = (eventType: string) => {
    const next = values.eventType.includes(eventType)
      ? values.eventType.filter((t) => t !== eventType)
      : [...values.eventType, eventType];
    onChange({ ...values, eventType: next });
  };

  const inputCls =
    'block w-full rounded-md border border-border-strong bg-surface px-2 py-1 text-sm text-ink ' +
    'focus:outline-none focus:ring-2 focus:ring-(--color-focus)';

  const fieldsetCls = 'space-y-2 rounded-lg border border-border-subtle p-3';
  const labelCls = 'block text-[10px] font-medium uppercase tracking-wide text-mute';

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onApply();
      }}
      className="space-y-3"
      aria-label="Filtros de auditoría"
    >
      <fieldset className={fieldsetCls}>
        <legend className="px-1 text-xs font-semibold text-ink">Tipo de evento</legend>
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
          {KNOWN_AUDIT_EVENT_TYPES.map((et) => (
            <label key={et} className="flex items-center gap-2 font-mono text-[11px] text-ink">
              <input
                type="checkbox"
                checked={values.eventType.includes(et)}
                onChange={() => toggleEventType(et)}
              />
              <span>{et}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className={fieldsetCls}>
        <legend className="px-1 text-xs font-semibold text-ink">Agregado / Actor</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="alf-aggregate-type">Tipo de agregado</label>
            <select
              id="alf-aggregate-type"
              value={values.aggregateType ?? ''}
              onChange={(e) =>
                onChange({ ...values, aggregateType: e.target.value || null })
              }
              className={inputCls}
            >
              <option value="">— cualquiera —</option>
              {KNOWN_AUDIT_AGGREGATE_TYPES.map((at) => (
                <option key={at} value={at}>{at}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="alf-actor-kind">Tipo de actor</label>
            <select
              id="alf-actor-kind"
              value={values.actorKind ?? ''}
              onChange={(e) =>
                onChange({
                  ...values,
                  actorKind: (e.target.value || null) as AuditActorKind | null,
                })
              }
              className={inputCls}
            >
              <option value="">— cualquiera —</option>
              {AUDIT_ACTOR_KINDS.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </div>
        </div>
      </fieldset>

      <fieldset className={fieldsetCls}>
        <legend className="px-1 text-xs font-semibold text-ink">Ventana temporal</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="alf-since">Desde</label>
            <input
              id="alf-since"
              type="date"
              value={values.since ?? ''}
              onChange={(e) => onChange({ ...values, since: e.target.value || null })}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="alf-until">Hasta</label>
            <input
              id="alf-until"
              type="date"
              value={values.until ?? ''}
              onChange={(e) => onChange({ ...values, until: e.target.value || null })}
              className={inputCls}
            />
          </div>
        </div>
      </fieldset>

      <fieldset className={fieldsetCls}>
        <legend className="px-1 text-xs font-semibold text-ink">Búsqueda de texto (FTS)</legend>
        <input
          type="text"
          value={values.q}
          onChange={(e) => onChange({ ...values, q: e.target.value })}
          className={inputCls}
          placeholder="ej. tomate, allergens, recipes.update…"
          maxLength={200}
        />
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={applying}
          className={cn(
            'rounded-md bg-(--color-primary) px-3 py-1.5 text-sm font-semibold text-(--color-on-primary)',
            'hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-(--color-focus)',
            applying && 'cursor-wait opacity-60',
          )}
        >
          {applying ? 'Aplicando…' : 'Aplicar'}
        </button>
        <button
          type="button"
          onClick={onReset}
          className="rounded-md border border-border-strong px-3 py-1.5 text-sm hover:bg-surface-muted"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={onExportCsv}
          className="ml-auto rounded-md border border-border-strong px-3 py-1.5 text-sm hover:bg-surface-muted"
        >
          Exportar CSV
        </button>
      </div>
    </form>
  );
}
