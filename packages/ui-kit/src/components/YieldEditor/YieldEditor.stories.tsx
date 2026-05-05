import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { YieldEditor } from './YieldEditor';
import type { AiSuggestionShape } from './YieldEditor.types';

const meta: Meta<typeof YieldEditor> = {
  title: 'AI/YieldEditor',
  component: YieldEditor,
  parameters: { layout: 'padded', docs: { description: { component:
    'Yield% editor with AI-suggestion + citation popover + chef-override flow per FR16/18/19. Iron rule (FR19): when no citation is available the editor surfaces "manual entry only" inline.',
  } } },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof YieldEditor>;

function withState(args: {
  initialValue?: number;
  aiEnabled?: boolean;
  initialSuggestion?: AiSuggestionShape | null;
  noCitationAvailable?: boolean;
  loading?: boolean;
  errorMessage?: string;
} = {}) {
  function Wrapped() {
    const [value, setValue] = useState(args.initialValue ?? 0.5);
    const [suggestion, setSuggestion] = useState<AiSuggestionShape | null>(
      args.initialSuggestion ?? null,
    );
    return (
      <YieldEditor
        value={value}
        onChange={setValue}
        aiEnabled={args.aiEnabled ?? true}
        suggestion={suggestion}
        noCitationAvailable={args.noCitationAvailable}
        loading={args.loading}
        errorMessage={args.errorMessage}
        onRequestSuggestion={() => undefined}
        onAccept={(tweak) => {
          setSuggestion((s) =>
            s ? { ...s, status: 'accepted', acceptedValue: tweak ?? null } : null,
          );
          if (tweak !== undefined) setValue(tweak);
          else if (suggestion) setValue(suggestion.value);
        }}
        onReject={() => {
          setSuggestion((s) => (s ? { ...s, status: 'rejected' } : null));
        }}
      />
    );
  }
  return Wrapped;
}

export const Idle: Story = { render: () => { const W = withState(); return <W />; } };

export const Loading: Story = {
  render: () => { const W = withState({ loading: true }); return <W />; },
};

export const PendingSuggestion: Story = {
  render: () => {
    const W = withState({
      initialSuggestion: {
        id: 'sug-1',
        value: 0.85,
        citationUrl: 'https://example.com/onion-yield',
        snippet: 'Pelar la cebolla y descartar las capas externas (~15% pérdida).',
        modelName: 'gpt-oss-20b-rag',
        status: 'pending',
      },
    });
    return <W />;
  },
};

export const AcceptedAsIs: Story = {
  render: () => {
    const W = withState({
      initialValue: 0.85,
      initialSuggestion: {
        id: 'sug-2',
        value: 0.85,
        citationUrl: 'https://example.com/onion-yield',
        snippet: 'Pelar la cebolla…',
        modelName: 'gpt-oss-20b-rag',
        status: 'accepted',
      },
    });
    return <W />;
  },
};

export const AcceptedWithTweak: Story = {
  render: () => {
    const W = withState({
      initialValue: 0.7,
      initialSuggestion: {
        id: 'sug-3',
        value: 0.85,
        acceptedValue: 0.7,
        citationUrl: 'https://example.com/onion-yield',
        snippet: 'Pelar la cebolla…',
        modelName: 'gpt-oss-20b-rag',
        status: 'accepted',
      },
    });
    return <W />;
  },
};

export const Rejected: Story = {
  render: () => {
    const W = withState({
      initialSuggestion: {
        id: 'sug-4',
        value: 0.85,
        citationUrl: 'https://example.com/onion-yield',
        snippet: 'Pelar la cebolla…',
        modelName: 'gpt-oss-20b-rag',
        status: 'rejected',
      },
    });
    return <W />;
  },
};

export const NoCitationAvailable: Story = {
  render: () => { const W = withState({ noCitationAvailable: true }); return <W />; },
};

export const ManualOnly: Story = {
  render: () => { const W = withState({ aiEnabled: false }); return <W />; },
};

export const ProviderError: Story = {
  render: () => {
    const W = withState({ errorMessage: 'Provider unreachable. Try again later.' });
    return <W />;
  },
};
