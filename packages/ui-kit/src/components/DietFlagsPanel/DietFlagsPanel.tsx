import { useEffect, useId, useRef, useState } from 'react';
import { Edit3, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import {
  ALL_DIET_FLAGS,
  type DietFlag,
  type DietFlagsPanelProps,
} from './DietFlagsPanel.types';

/**
 * Diet-flag display + Manager+ override modal. Visible flags row mirrors the
 * conservative inference output (or the override when present). Override
 * modal enforces the reason length client-side (per Gate D decision 2);
 * applies optimistic update + rolls back on backend rejection.
 */
export function DietFlagsPanel({
  state,
  canOverride,
  onApplyOverride,
  minReasonLength = 10,
  className,
}: DietFlagsPanelProps) {
  const visibleFlags = state.override?.value ?? state.asserted;
  const [optimisticFlags, setOptimisticFlags] = useState<DietFlag[] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [rejectionMessage, setRejectionMessage] = useState<string | null>(null);

  const renderedFlags = optimisticFlags ?? visibleFlags;

  return (
    <div
      className={cn(
        'rounded-md border border-border bg-surface p-4',
        className,
      )}
      style={{ borderWidth: '1px', borderStyle: 'solid' }}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-mute">
          Diet flags
        </h3>
        {canOverride && (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5',
              'text-sm text-ink hover:bg-surface-2',
            )}
            style={{
              minHeight: 'var(--touch-target-min)',
              borderWidth: '1px',
              borderStyle: 'solid',
            }}
          >
            <Edit3 aria-hidden="true" size={14} />
            Override
          </button>
        )}
      </div>

      {renderedFlags.length === 0 ? (
        <p className="mt-2 text-sm text-mute">No diet flags asserted.</p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-2 list-none p-0" aria-label="Asserted diet flags">
          {renderedFlags.map((flag) => (
            <li key={flag}>
              <FlagChip flag={flag} />
            </li>
          ))}
        </ul>
      )}

      {state.override && (
        <p className="mt-2 text-xs text-mute">
          Override by <strong>{state.override.appliedBy}</strong> at{' '}
          <time dateTime={state.override.appliedAt}>
            {formatDateTime(state.override.appliedAt)}
          </time>{' '}
          — &ldquo;{state.override.reason}&rdquo;
        </p>
      )}

      {state.warnings && state.warnings.length > 0 && (
        <ul className="mt-3 list-none space-y-1 p-0">
          {state.warnings.map((w, i) => (
            <li key={i} role="note" className="text-xs text-mute">
              {w}
            </li>
          ))}
        </ul>
      )}

      {rejectionMessage && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {rejectionMessage}
        </p>
      )}

      {modalOpen && (
        <OverrideModal
          initialFlags={visibleFlags}
          minReasonLength={minReasonLength}
          onCancel={() => setModalOpen(false)}
          onSubmit={async (payload) => {
            setRejectionMessage(null);
            setOptimisticFlags(payload.value);
            setModalOpen(false);
            try {
              await onApplyOverride(payload);
              setOptimisticFlags(null);
            } catch (err) {
              setOptimisticFlags(null);
              setRejectionMessage(
                err instanceof Error ? err.message : 'Override rejected by server',
              );
            }
          }}
        />
      )}
    </div>
  );
}

function FlagChip({ flag }: { flag: DietFlag }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-pill border border-border bg-accent-soft px-2.5 py-1 text-sm font-semibold text-ink"
      style={{ borderWidth: '1px', borderStyle: 'solid' }}
    >
      {flag}
    </span>
  );
}

interface OverrideModalProps {
  initialFlags: DietFlag[];
  minReasonLength: number;
  onCancel: () => void;
  onSubmit: (payload: { value: DietFlag[]; reason: string }) => Promise<void> | void;
}

function OverrideModal({
  initialFlags,
  minReasonLength,
  onCancel,
  onSubmit,
}: OverrideModalProps) {
  const titleId = useId();
  const reasonId = useId();
  const [selected, setSelected] = useState<Set<DietFlag>>(new Set(initialFlags));
  const [reason, setReason] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  function toggleFlag(flag: DietFlag) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(flag)) next.delete(flag);
      else next.add(flag);
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (reason.trim().length < minReasonLength) {
      setValidationError(`Reason must be at least ${minReasonLength} characters`);
      return;
    }
    setValidationError(null);
    onSubmit({ value: Array.from(selected), reason: reason.trim() });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-md border border-border bg-surface p-5 shadow-xl"
        style={{ borderWidth: '1px', borderStyle: 'solid' }}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-lg font-semibold text-ink">
            Override diet flags
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onCancel}
            className="text-mute hover:text-ink"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </div>

        <fieldset className="mt-4 space-y-2">
          <legend className="text-sm font-semibold text-ink">Flags</legend>
          {ALL_DIET_FLAGS.map((flag) => (
            <label key={flag} className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={selected.has(flag)}
                onChange={() => toggleFlag(flag)}
                className="h-4 w-4"
              />
              {flag}
            </label>
          ))}
        </fieldset>

        <div className="mt-4">
          <label htmlFor={reasonId} className="block text-sm font-semibold text-ink">
            Reason{' '}
            <span className="font-normal text-mute">
              (≥ {minReasonLength} chars)
            </span>
          </label>
          <textarea
            id={reasonId}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-ink"
            style={{ borderWidth: '1px', borderStyle: 'solid' }}
          />
          {validationError && (
            <p role="alert" className="mt-1 text-xs text-destructive">
              {validationError}
            </p>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink hover:bg-surface-2"
            style={{
              minHeight: 'var(--touch-target-min)',
              borderWidth: '1px',
              borderStyle: 'solid',
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-press"
            style={{ minHeight: 'var(--touch-target-min)' }}
          >
            Apply
          </button>
        </div>
      </form>
    </div>
  );
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
