/**
 * Mirrors apps/api/src/recipes/interface/dto/recipe.dto.ts shape (subset).
 * Hand-mirrored per #12 retro tech-debt note (codegen pipeline filed as
 * future work).
 */

export interface RecipeListItem {
  id: string;
  name: string;
  displayLabel: string;
  isActive: boolean;
}

export interface RecipePickerProps {
  /** Result list rendered in the dropdown. Caller fetches + paginates. */
  recipes: RecipeListItem[];
  /** Called after the internal 250 ms debounce when the user types. */
  onSearch: (query: string) => void;
  /** Called when the user picks a result via mouse, Enter, or Tab. */
  onSelect: (item: RecipeListItem) => void;
  /** Forces the dropdown into the loading state. */
  loading?: boolean;
  /** Visible placeholder for the empty input. Defaults to "Search recipes…". */
  placeholder?: string;
  /** Copy shown in the dropdown when `recipes` is empty. */
  emptyStateCopy?: string;
  /** Controlled input value. When provided, the picker stays in sync. */
  value?: string;
  /** Restricts results to active recipes only (visual filter — backend honours its own scope). */
  activeOnly?: boolean;
  className?: string;
  'aria-label'?: string;
}
