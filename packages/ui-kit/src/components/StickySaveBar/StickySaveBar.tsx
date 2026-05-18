import { Save, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import type { StickySaveBarProps } from './StickySaveBar.types';

/**
 * Sticky save bar — fixed-bottom action rail for form surfaces with
 * unsaved changes (audit v2 A-6 + v1 L0-6).
 *
 * Pattern: while a form is dirty, this bar surfaces from the bottom of
 * the viewport so the operator never has to scroll back to find Save.
 * Hides on `visible={false}` so the bar doesn't compete for attention
 * when no changes are pending.
 *
 * Renders into the bottom-right of the section by default; consumers
 * provide their own container if a different anchor is needed.
 *
 * Per `feedback_ux_engine_silence` — no engine attribution, no library
 * name, no version chips. The bar is pure utility.
 */
export function StickySaveBar({
  visible,
  onPrimary,
  primaryLabel = 'Guardar cambios',
  primaryPending = false,
  onSecondary,
  secondaryLabel = 'Descartar',
  lastSavedAt,
  message,
  className,
}: StickySaveBarProps) {
  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Acciones pendientes"
      className={cn(
        'sticky bottom-0 left-0 right-0 z-30 mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-(--color-border-strong) bg-(--color-surface) px-4 py-3 shadow-[0_-2px_8px_-2px_rgba(0,0,0,0.08)] sm:px-6',
        className,
      )}
      style={{
        backgroundColor: 'var(--color-surface)',
        borderTopColor: 'var(--color-border-strong)',
      }}
    >
      <div className="flex flex-col gap-1 text-xs text-(--color-mute)">
        <span className="font-medium text-(--color-ink)">Cambios sin guardar</span>
        {message ? (
          <span style={{ color: 'var(--color-mute)' }}>{message}</span>
        ) : lastSavedAt ? (
          <span>Último guardado: {formatLastSaved(lastSavedAt)}</span>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        {onSecondary && (
          <button
            type="button"
            onClick={onSecondary}
            disabled={primaryPending}
            className="inline-flex items-center gap-1 rounded-md border border-(--color-border-strong) bg-transparent px-3 py-1.5 text-sm font-medium text-(--color-mute) transition hover:bg-(--color-bg) focus:outline-none focus:ring-2 focus:ring-(--color-focus) disabled:opacity-60"
          >
            <X aria-hidden="true" size={14} />
            {secondaryLabel}
          </button>
        )}
        <button
          type="button"
          onClick={onPrimary}
          disabled={primaryPending}
          className="inline-flex items-center gap-2 rounded-md bg-(--color-accent) px-5 py-2 text-sm font-semibold text-(--color-accent-fg) shadow-sm transition hover:brightness-110 active:translate-y-px focus:outline-none focus:ring-2 focus:ring-(--color-focus) focus:ring-offset-2 disabled:opacity-60"
        >
          <Save aria-hidden="true" size={16} />
          {primaryPending ? 'Guardando…' : primaryLabel}
        </button>
      </div>
    </div>
  );
}

/** "hace 12 min" / "hace 2 h" / "hace 3 d" relative format. */
function formatLastSaved(iso: string): string {
  const delta = Date.now() - Date.parse(iso);
  if (Number.isNaN(delta) || delta < 0) return 'recientemente';
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return 'hace <1 min';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} d`;
}
