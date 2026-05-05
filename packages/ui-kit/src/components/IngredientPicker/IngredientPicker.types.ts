/**
 * Mirrors apps/api/src/ingredients/interface/dto/ingredient.dto.ts (subset).
 * `brandName` and `barcode` are nullable until #5 m2-ingredients-extension
 * ships and the OFF mirror starts populating them — picker degrades to
 * single-line per design.md §Risks.
 */

export interface IngredientListItem {
  id: string;
  name: string;
  /** OFF-mirror brand name. Null when only local data is available. */
  brandName: string | null;
  /** OFF-mirror barcode. Null when only local data is available. */
  barcode: string | null;
  displayLabel: string;
  isActive: boolean;
}

export interface IngredientPickerProps {
  ingredients: IngredientListItem[];
  onSearch: (query: string) => void;
  onSelect: (item: IngredientListItem) => void;
  loading?: boolean;
  placeholder?: string;
  emptyStateCopy?: string;
  value?: string;
  className?: string;
  'aria-label'?: string;
}
