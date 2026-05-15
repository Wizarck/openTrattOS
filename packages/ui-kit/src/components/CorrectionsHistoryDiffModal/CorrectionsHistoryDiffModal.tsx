import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';
import type {
  CorrectionsHistoryDiffModalProps,
  CorrectionsHistoryFieldDiff,
} from './CorrectionsHistoryDiffModal.types';

const USER_ID_DISPLAY_CHARS = 8;
const EMPTY_VALUE_PLACEHOLDER = '∅';

/**
 * Per-field diff modal for one entry of the corrections-history list
 * (slice `m3.x-corrections-history-diff-modal`, follow-up to PR #160
 * which shipped the list primitive).
 *
 * The list shows "N campos modificados" but not WHICH fields changed.
 * Clicking an entry opens this modal, which renders an `old → new` table
 * for every field whose value differs between the entry's snapshot
 * (`previousCorrection.fields`) and the next-newer baseline.
 *
 * The component is presentational: the caller is responsible for
 * computing the diff and filtering no-op fields.
 *
 * Accessibility:
 *  - `role="dialog"` + `aria-modal="true"` + `aria-labelledby`
 *  - Initial focus on the dialog container (matches `DietFlagsPanel`'s
 *    OverrideModal pattern)
 *  - ESC closes
 *  - Backdrop click closes (inner stops propagation)
 */
export function CorrectionsHistoryDiffModal({
  entry,
  diffs,
  onClose,
  locale = 'es-ES',
  className,
}: CorrectionsHistoryDiffModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  const fmt = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const correctedAt = (() => {
    const d = new Date(entry.correctedAt);
    return Number.isNaN(d.getTime()) ? entry.correctedAt : fmt.format(d);
  })();
  const userElided =
    entry.correctedByUserId.length > USER_ID_DISPLAY_CHARS
      ? `${entry.correctedByUserId.slice(0, USER_ID_DISPLAY_CHARS)}…`
      : entry.correctedByUserId;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      ref={dialogRef}
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4',
        className,
      )}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      onClick={onClose}
      data-testid="corrections-history-diff-modal"
    >
      <div
        className="w-full max-w-2xl rounded-md border border-border bg-surface p-5 shadow-xl"
        style={{ borderWidth: '1px', borderStyle: 'solid' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-ink">
              Detalle de corrección
            </h2>
            <p className="mt-1 text-xs text-mute">
              <time dateTime={entry.correctedAt}>{correctedAt}</time>
              {' · '}
              <span title={entry.correctedByUserId}>{userElided}</span>
            </p>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="text-mute hover:text-ink"
            data-testid="corrections-history-diff-modal-close"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </div>

        {entry.reason && (
          <p
            className="mt-3 rounded p-2 text-sm text-ink"
            style={{
              backgroundColor: 'var(--color-surface-2)',
              borderColor: 'var(--color-border)',
              borderWidth: '1px',
              borderStyle: 'solid',
            }}
          >
            {entry.reason}
          </p>
        )}

        <div className="mt-4">
          {diffs.length === 0 ? (
            <p
              className="rounded p-3 text-sm"
              style={{
                color: 'var(--color-mute)',
                backgroundColor: 'var(--color-surface-2)',
                borderColor: 'var(--color-border)',
                borderWidth: '1px',
                borderStyle: 'solid',
              }}
              data-testid="corrections-history-diff-empty"
            >
              Sin cambios de campo registrados
            </p>
          ) : (
            <ul
              className="flex flex-col gap-2 list-none p-0"
              aria-label="Campos modificados"
              data-testid="corrections-history-diff-list"
            >
              {diffs.map((d) => (
                <DiffRow key={d.fieldName} diff={d} />
              ))}
            </ul>
          )}
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border bg-surface px-4 py-2 text-sm text-ink hover:bg-surface-2"
            style={{
              minHeight: 'var(--touch-target-min)',
              borderWidth: '1px',
              borderStyle: 'solid',
            }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function DiffRow({ diff }: { diff: CorrectionsHistoryFieldDiff }) {
  return (
    <li
      className="rounded p-2"
      style={{
        backgroundColor: 'var(--color-surface-2)',
        borderColor: 'var(--color-border)',
        borderWidth: '1px',
        borderStyle: 'solid',
      }}
      data-testid="corrections-history-diff-row"
      data-field-name={diff.fieldName}
    >
      <p
        className="text-xs font-semibold"
        style={{ color: 'var(--color-mute)' }}
      >
        {diff.fieldName}
      </p>
      <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-sm">
        <ValueCell
          label="anterior"
          value={diff.oldValue}
          variant="old"
        />
        <span aria-hidden="true" style={{ color: 'var(--color-mute)' }}>
          →
        </span>
        <ValueCell label="nuevo" value={diff.newValue} variant="new" />
      </div>
    </li>
  );
}

function ValueCell({
  label,
  value,
  variant,
}: {
  label: string;
  value: string | null;
  variant: 'old' | 'new';
}) {
  const isEmpty = value === null || value === '';
  const display = isEmpty ? EMPTY_VALUE_PLACEHOLDER : value;
  return (
    <span
      className="block break-words rounded px-1.5 py-0.5"
      data-variant={variant}
      style={{
        backgroundColor:
          variant === 'old'
            ? 'var(--color-warn-bg, var(--color-surface-1))'
            : 'var(--color-accent-soft, var(--color-surface-1))',
        color: 'var(--color-ink)',
        fontStyle: isEmpty ? 'italic' : 'normal',
      }}
      aria-label={`Valor ${label}`}
    >
      {display}
    </span>
  );
}
