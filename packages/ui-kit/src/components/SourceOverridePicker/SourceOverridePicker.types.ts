/**
 * Mirrors apps/api/src/suppliers/interface/dto/supplier-item.dto.ts (subset)
 * + the override marker carried via `currentOverrideId`. The PreferredSupplier
 * Resolver from #3 controls which option is `isPreferred`.
 */

export interface SupplierItemOption {
  id: string;
  supplierName: string;
  price: number;
  currency: string;
  /** True when this is the resolver-preferred option for the parent ingredient. */
  isPreferred: boolean;
  /** Optional pack-size descriptor (e.g. "1 kg", "10×500ml"). */
  packLabel?: string;
}

export interface SourceOverridePickerProps {
  /** All eligible supplier-items. Will be sorted preferred-first then by price ascending. */
  options: SupplierItemOption[];
  /** Current override id if the recipe-line already has one. `null` means "use resolver default". */
  currentOverrideId: string | null;
  /** Called when the user clicks Apply with the selected option. */
  onApply: (payload: { supplierItemId: string }) => void;
  /**
   * Called when the user clicks "Use preferred" — clears the override (per Gate D
   * decision 1a). Backend should reset the line's `sourceOverrideRef` to null.
   */
  onClear: () => void;
  /** Locale for currency formatting. Defaults to en-EU. */
  locale?: string;
  /** Empty-state copy when options is []. Defaults to "No supplier sources available". */
  emptyStateCopy?: string;
  className?: string;
  'aria-label'?: string;
}
