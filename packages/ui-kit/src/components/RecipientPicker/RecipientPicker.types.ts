export interface RecipientOption {
  id: string;
  label: string;
  email: string;
}

export interface RecipientPickerProps {
  /**
   * Controlled expansion state. Default is collapsed (the email opt-in
   * pattern per ADR-J9-RECIPIENT-PICKER-COLLAPSED-BY-DEFAULT).
   */
  expanded: boolean;
  onToggleExpanded: (expanded: boolean) => void;
  /** Pre-configured contacts (inspector, insurer, etc.). */
  contacts: ReadonlyArray<RecipientOption>;
  /** Email addresses currently selected for dispatch. */
  selectedAddresses: ReadonlyArray<string>;
  onChangeSelected: (addresses: ReadonlyArray<string>) => void;
  className?: string;
}
