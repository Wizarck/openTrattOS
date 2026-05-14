import { useMemo } from 'react';
import { cn } from '../../lib/cn';
import type {
  ExportProgressStripProps,
  ProgressStep,
} from './ExportProgressStrip.types';

/**
 * j9 region #7 — progress strip (slice #15 m3-appcc-i18n-ui).
 *
 * Pure presentational. Per ADR-J9-PROGRESS-STRIP-SSE-DRIVEN the parent
 * screen reads the SSE stream and advances `currentStepIndex`; this
 * component just renders the step states + the live page/byte meta.
 *
 * Accessibility: `role="status"` + `aria-live="polite"` on the outer
 * container. The component derives a stable `activeLabel` so the live
 * region only re-announces on transitions, not on every prop change.
 */
export function ExportProgressStrip({
  steps,
  currentStepIndex,
  status,
  sizeBytes,
  pageCount,
  onRetry,
  className,
}: ExportProgressStripProps) {
  const activeLabel = useMemo(() => {
    if (status === 'done') return 'Listo';
    if (status === 'failed') {
      const failed = steps[currentStepIndex];
      return failed
        ? `Falló: ${failed.label}`
        : 'Generación falló';
    }
    const current = steps[currentStepIndex];
    return current ? current.label : '';
  }, [steps, currentStepIndex, status]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'mt-3 rounded-md border p-4 text-sm',
        className,
      )}
      style={{
        backgroundColor: 'var(--color-surface)',
        borderColor:
          status === 'failed'
            ? 'var(--color-destructive)'
            : 'var(--color-border)',
      }}
      data-component="export-progress-strip"
      data-status={status}
    >
      <span className="sr-only">{activeLabel}</span>
      <ol
        className="flex flex-wrap gap-4 p-0 text-sm"
        style={{ listStyle: 'none', margin: 0 }}
      >
        {steps.map((step, index) => (
          <Step
            key={step.key}
            step={step}
            stepState={derivedStepState(index, currentStepIndex, status)}
          />
        ))}
      </ol>
      <div
        className="mt-3 text-xs"
        style={{ color: 'var(--color-mute)' }}
      >
        {pageCount != null && (
          <span>
            ~{pageCount} páginas{sizeBytes != null ? ' · ' : ''}
          </span>
        )}
        {sizeBytes != null && <span>~{formatBytes(sizeBytes)}</span>}
        {pageCount == null && sizeBytes == null && (
          <span>Esperando estimación del bundle…</span>
        )}
      </div>
      {status === 'failed' && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-md border bg-transparent px-3 py-1.5 text-sm font-medium"
          style={{
            color: 'var(--color-destructive)',
            borderColor: 'var(--color-destructive)',
          }}
        >
          Reintentar
        </button>
      )}
    </div>
  );
}

type StepStateValue = 'done' | 'active' | 'pending' | 'failed';

function derivedStepState(
  index: number,
  currentStepIndex: number,
  status: 'in-progress' | 'done' | 'failed',
): StepStateValue {
  if (status === 'done') return 'done';
  if (index < currentStepIndex) return 'done';
  if (index > currentStepIndex) return 'pending';
  // index === currentStepIndex
  return status === 'failed' ? 'failed' : 'active';
}

function Step({
  step,
  stepState,
}: {
  step: ProgressStep;
  stepState: StepStateValue;
}) {
  const dotColor = (() => {
    switch (stepState) {
      case 'done':
        return 'var(--color-success)';
      case 'active':
        return 'var(--color-accent)';
      case 'failed':
        return 'var(--color-destructive)';
      case 'pending':
      default:
        return 'var(--color-surface-2)';
    }
  })();
  const textColor = (() => {
    switch (stepState) {
      case 'done':
        return 'var(--color-success)';
      case 'active':
        return 'var(--color-ink)';
      case 'failed':
        return 'var(--color-destructive)';
      case 'pending':
      default:
        return 'var(--color-mute)';
    }
  })();
  return (
    <li
      className="inline-flex items-center gap-2"
      data-step-key={step.key}
      data-step-state={stepState}
      style={{ color: textColor, fontWeight: stepState === 'active' ? 500 : 400 }}
    >
      <span
        aria-hidden="true"
        style={{
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          backgroundColor: dotColor,
          display: 'inline-block',
        }}
      />
      <span>{step.label}</span>
    </li>
  );
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) {
    return `${(bytes / 1_000_000).toFixed(1)} MB`;
  }
  if (bytes >= 1_000) {
    return `${Math.round(bytes / 1_000)} KB`;
  }
  return `${bytes} B`;
}
