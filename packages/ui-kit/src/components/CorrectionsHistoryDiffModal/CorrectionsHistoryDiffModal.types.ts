import type { CorrectionsHistoryEntry } from '../CorrectionsHistoryList/CorrectionsHistoryList.types';

/**
 * One field-level diff inside a single corrections-history entry. `oldValue`
 * is what the field held in the entry's own snapshot
 * (`previousCorrection.fields[x].operatorValue`); `newValue` is what the
 * field holds in the *baseline* — either the next-newer entry's snapshot
 * or, for the most recent entry, the current item state. Both can be
 * `null` (the field was absent on one side).
 */
export interface CorrectionsHistoryFieldDiff {
  /** Field name (e.g. `lineItems[0].quantity`, `supplier`). */
  fieldName: string;
  /** Value held BEFORE this correction was applied. */
  oldValue: string | null;
  /** Value held AFTER this correction (i.e. in the next-newer snapshot or current). */
  newValue: string | null;
}

export interface CorrectionsHistoryDiffModalProps {
  /** The entry being inspected — drives the header. */
  entry: CorrectionsHistoryEntry;
  /**
   * Per-field diffs computed by the caller. Only fields whose `oldValue`
   * differs from `newValue` SHOULD be passed in — the component renders
   * each row as-is and assumes the caller has already filtered no-ops.
   */
  diffs: ReadonlyArray<CorrectionsHistoryFieldDiff>;
  /** Invoked when the operator closes the modal (X button, ESC, backdrop click). */
  onClose: () => void;
  /** Optional locale for the header timestamp; defaults to `'es-ES'`. */
  locale?: string;
  className?: string;
}
