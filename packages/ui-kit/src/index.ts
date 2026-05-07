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
export { MenuItemRanker } from './components/MenuItemRanker';
export type { MenuItemRankerProps, DashboardMenuItem } from './components/MenuItemRanker';
export { MacroPanel, MACRO_LABELS, PRIMARY_MACRO_KEYS } from './components/MacroPanel';
export type { MacroPanelProps, MacroRollup } from './components/MacroPanel';
export { LabelPreview, LABEL_PREVIEW_LOCALES } from './components/LabelPreview';
export type {
  LabelPreviewProps,
  LabelPreviewLocale,
  LabelApiError,
  LabelMissingFieldsError,
  LabelUnsupportedLocaleError,
  LabelPrintAdapterNotConfiguredError,
  LabelGenericApiError,
} from './components/LabelPreview';
export { YieldEditor, AiSuggestionEditor, MIN_REJECT_REASON_LENGTH } from './components/YieldEditor';
export type {
  YieldEditorProps,
  AiSuggestionShape,
  AiSuggestionStatus,
} from './components/YieldEditor';
export { WasteFactorEditor } from './components/WasteFactorEditor';
export type { WasteFactorEditorProps } from './components/WasteFactorEditor';
export { AgentChatWidget } from './components/AgentChatWidget';
export type {
  AgentChatWidgetProps,
  ChatBubble,
  ChatBubbleAttachment,
  ChatRole,
  ChatSseEvent as AgentChatSseEvent,
  SendRequest as AgentChatSendRequest,
} from './components/AgentChatWidget';
