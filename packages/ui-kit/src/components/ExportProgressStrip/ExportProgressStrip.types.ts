export interface ProgressStep {
  /** Stable machine key (e.g. "index_audit_log"). */
  key: string;
  /** Human-readable label rendered in the strip. */
  label: string;
}

export type ExportProgressStatus = 'in-progress' | 'done' | 'failed';

export interface ExportProgressStripProps {
  steps: ReadonlyArray<ProgressStep>;
  /**
   * Index of the active step (0-based). Steps with index `< current`
   * render `--success` (done); the step at `current` renders `--accent`
   * (active) when status is `in-progress`, `--destructive` when status
   * is `failed`, or `--success` when status is `done`; steps with index
   * `> current` render `--mute` (pending).
   */
  currentStepIndex: number;
  status: ExportProgressStatus;
  /** Total bytes of the rendered bundle (live updates). */
  sizeBytes?: number;
  /** Page count of the rendered bundle (live updates). */
  pageCount?: number;
  /** Retry handler — mounted when status is 'failed'. */
  onRetry?: () => void;
  className?: string;
}
