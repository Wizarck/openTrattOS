// Re-exports from YieldEditor — both editors share the same prop shape since
// they're driven by the same AI suggestion contract. The only differences are
// the labels + helpText, which `WasteFactorEditor` overrides at the wrapper
// layer.
export type {
  YieldEditorProps as WasteFactorEditorProps,
  AiSuggestionShape,
  AiSuggestionStatus,
} from '../YieldEditor/YieldEditor.types';
export { MIN_REJECT_REASON_LENGTH } from '../YieldEditor/YieldEditor.types';
