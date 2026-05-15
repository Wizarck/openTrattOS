import { cn } from '../../lib/cn';
import type {
  Scope,
  ScopeCheckboxListProps,
  ScopeRowDefinition,
} from './ScopeCheckboxList.types';

/**
 * j9 region #4 — scope checkboxes (slice #15 m3-appcc-i18n-ui).
 *
 * Five checkbox rows, each with a one-line `--mute` description. Per
 * j9 §Decisions, scope is checkboxes (not a multi-select dropdown) so
 * every dimension of the export is visible at-glance. Partial
 * selections are natural (the dropdown pattern would force "all or pick
 * subset" mental work).
 *
 * Controlled component: parent owns the `value` Scope object. Each
 * toggle fires `onChange` with the mutated scope.
 */
export const DEFAULT_SCOPE_ROWS: ReadonlyArray<ScopeRowDefinition> = [
  {
    key: 'haccp',
    label: 'HACCP records (CCP readings + correctivas)',
    description:
      'Capítulo HACCP completo con vinculación CCP → acción correctiva → reentrenamiento.',
  },
  {
    key: 'lot',
    label: 'Lot lifecycle (recepción → consumo)',
    description:
      'Trazabilidad completa de cada lote desde recepción hasta consumo final.',
  },
  {
    key: 'procurement',
    label: 'Procurement (PO + GR + reconciliación)',
    description: 'Órdenes de compra, recepciones, discrepancias resueltas.',
  },
  {
    key: 'photo',
    label: 'Photo-ingestion provenance',
    description: 'Origen de cada lote/producto creado por ingestión vía foto.',
  },
  {
    key: 'ai_obs',
    label: 'AI observability footprint',
    description:
      'Huella de uso AI durante el rango (capacidades, modelos, coste).',
  },
];

export function ScopeCheckboxList({
  value,
  onChange,
  rows = DEFAULT_SCOPE_ROWS,
  className,
}: ScopeCheckboxListProps) {
  return (
    <ul
      className={cn('m-0 list-none p-0', className)}
      data-component="scope-checkbox-list"
    >
      {rows.map((row) => {
        const checked = value[row.key];
        const id = `scope-${row.key}`;
        return (
          <li
            key={row.key}
            className="grid items-start gap-3 border-t py-3"
            style={{
              gridTemplateColumns: '24px 1fr',
              borderTopColor: 'var(--color-border)',
            }}
            data-scope-key={row.key}
            data-checked={checked ? 'true' : 'false'}
          >
            <input
              type="checkbox"
              id={id}
              checked={checked}
              onChange={(e) => {
                const next: Scope = { ...value, [row.key]: e.target.checked };
                onChange(next);
              }}
              style={{
                width: '18px',
                height: '18px',
                marginTop: '2px',
                accentColor: 'var(--color-accent)',
              }}
            />
            <label htmlFor={id} className="block text-sm">
              <span style={{ color: 'var(--color-ink)' }}>{row.label}</span>
              <span
                className="mt-1 block text-xs"
                style={{ color: 'var(--color-mute)' }}
              >
                {row.description}
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
