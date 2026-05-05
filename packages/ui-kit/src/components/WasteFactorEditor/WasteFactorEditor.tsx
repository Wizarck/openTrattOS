import { AiSuggestionEditor } from '../YieldEditor/YieldEditor';
import type { WasteFactorEditorProps } from './WasteFactorEditor.types';

/**
 * Recipe-level waste factor editor with AI-suggestion + citation popover +
 * chef-override flow per FR17 / FR18 / FR19. Composes `AiSuggestionEditor`
 * from the YieldEditor module — same state machine, different labels.
 */
export function WasteFactorEditor(props: WasteFactorEditorProps) {
  return (
    <AiSuggestionEditor
      kind="waste"
      title="Waste factor"
      label="Factor de merma"
      helpText="Pérdida de masa durante la preparación (0-100%)."
      {...props}
    />
  );
}
