import type { ReactNode } from 'react';

export interface StickySaveBarProps {
  /** Render only when there are unsaved changes (otherwise the bar hides). */
  visible: boolean;
  /** Primary action — usually "Guardar cambios". */
  onPrimary: () => void;
  /** Label for the primary CTA. */
  primaryLabel?: string;
  /** "Guardando…" / disabled state. */
  primaryPending?: boolean;
  /** Optional secondary action — usually "Descartar". */
  onSecondary?: () => void;
  secondaryLabel?: string;
  /** ISO timestamp of the last successful save, rendered as "Guardado hace Xm". */
  lastSavedAt?: string | null;
  /** Optional error/status message, rendered left of the actions. */
  message?: ReactNode;
  className?: string;
}
