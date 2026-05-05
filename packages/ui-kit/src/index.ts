// Public API surface of @opentrattos/ui-kit.
// Components live under src/components/<Name>/; this barrel re-exports them.

export { cn } from './lib/cn';
export { AllergenBadge } from './components/AllergenBadge';
export type { AllergenBadgeProps, AllergenCode } from './components/AllergenBadge';
export { MarginPanel } from './components/MarginPanel';
export type { MarginPanelProps, MarginStatus, MarginReport } from './components/MarginPanel';
export { RecipePicker } from './components/RecipePicker';
export type { RecipePickerProps, RecipeListItem } from './components/RecipePicker';
export { IngredientPicker } from './components/IngredientPicker';
export type { IngredientPickerProps, IngredientListItem } from './components/IngredientPicker';
export { SourceOverridePicker } from './components/SourceOverridePicker';
export type {
  SourceOverridePickerProps,
  SupplierItemOption,
} from './components/SourceOverridePicker';
export { CostDeltaTable } from './components/CostDeltaTable';
export type {
  CostDeltaTableProps,
  CostDeltaRow,
  CostDeltaDirection,
} from './components/CostDeltaTable';
export { DietFlagsPanel, ALL_DIET_FLAGS } from './components/DietFlagsPanel';
export type {
  DietFlag,
  DietFlagsOverride,
  DietFlagsPanelProps,
  DietFlagsState,
} from './components/DietFlagsPanel';
