import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { WasteFactorEditor } from './WasteFactorEditor';
import type { AiSuggestionShape } from './WasteFactorEditor.types';

const meta: Meta<typeof WasteFactorEditor> = {
  title: 'AI/WasteFactorEditor',
  component: WasteFactorEditor,
  parameters: { layout: 'padded', docs: { description: { component:
    'Recipe-level waste factor editor — same AI-suggestion + citation flow as YieldEditor, with waste-specific labels.',
  } } },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof WasteFactorEditor>;

function withState(initialSuggestion: AiSuggestionShape | null = null) {
  function Wrapped() {
    const [value, setValue] = useState(0.05);
    const [suggestion, setSuggestion] = useState<AiSuggestionShape | null>(initialSuggestion);
    return (
      <WasteFactorEditor
        value={value}
        onChange={setValue}
        aiEnabled={true}
        suggestion={suggestion}
        onRequestSuggestion={() => undefined}
        onAccept={(tweak) =>
          setSuggestion((s) =>
            s ? { ...s, status: 'accepted', acceptedValue: tweak ?? null } : null,
          )
        }
        onReject={() => setSuggestion((s) => (s ? { ...s, status: 'rejected' } : null))}
      />
    );
  }
  return Wrapped;
}

export const Idle: Story = { render: () => { const W = withState(); return <W />; } };

export const PendingSuggestion: Story = {
  render: () => {
    const W = withState({
      id: 'sug-w1',
      value: 0.05,
      citationUrl: 'https://example.com/braised',
      snippet: 'Salteado pierde ~5% de masa por evaporación.',
      modelName: 'gpt-oss-20b-rag',
      status: 'pending',
    });
    return <W />;
  },
};
