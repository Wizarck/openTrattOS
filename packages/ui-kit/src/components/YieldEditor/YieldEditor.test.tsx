import { fireEvent, render, screen } from '@testing-library/react';
import { YieldEditor } from './YieldEditor';
import type { AiSuggestionShape } from './YieldEditor.types';

function pendingSuggestion(): AiSuggestionShape {
  return {
    id: 'sug-1',
    value: 0.85,
    citationUrl: 'https://example.com/cited',
    snippet: 'Pelar la cebolla y descartar las capas externas (~15% pérdida)',
    modelName: 'gpt-oss-20b-rag',
    status: 'pending',
  };
}

function baseProps() {
  return {
    value: 0.5,
    onChange: vi.fn(),
    aiEnabled: true,
    onRequestSuggestion: vi.fn(),
    onAccept: vi.fn(),
    onReject: vi.fn(),
  };
}

describe('YieldEditor — basic states', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the input with current value', () => {
    render(<YieldEditor {...baseProps()} value={0.85} />);
    expect((screen.getByTestId('yield-input') as HTMLInputElement).value).toBe('85');
  });

  it('emits onChange in fraction form when user edits', () => {
    const props = baseProps();
    render(<YieldEditor {...props} />);
    fireEvent.change(screen.getByTestId('yield-input'), { target: { value: '70' } });
    expect(props.onChange).toHaveBeenCalledWith(0.7);
  });

  it('shows the AI button when aiEnabled', () => {
    render(<YieldEditor {...baseProps()} />);
    expect(screen.getByTestId('yield-suggest-button')).toBeInTheDocument();
  });

  it('hides AI affordances when aiEnabled=false', () => {
    render(<YieldEditor {...baseProps()} aiEnabled={false} />);
    expect(screen.queryByTestId('yield-suggest-button')).toBeNull();
  });

  it('emits onRequestSuggestion when AI button clicked', () => {
    const props = baseProps();
    render(<YieldEditor {...props} />);
    fireEvent.click(screen.getByTestId('yield-suggest-button'));
    expect(props.onRequestSuggestion).toHaveBeenCalledTimes(1);
  });

  it('shows "Sugiriendo…" while loading', () => {
    render(<YieldEditor {...baseProps()} loading />);
    expect(screen.getByTestId('yield-suggest-button')).toHaveTextContent('Sugiriendo…');
    expect(screen.getByTestId('yield-suggest-button')).toBeDisabled();
  });
});

describe('YieldEditor — pending suggestion block', () => {
  it('renders suggestion percent + citation toggle when pending', () => {
    render(<YieldEditor {...baseProps()} suggestion={pendingSuggestion()} />);
    const block = screen.getByTestId('yield-suggestion-pending');
    expect(block).toHaveTextContent('IA sugiere: 85%');
    expect(screen.getByTestId('yield-citation-toggle')).toBeInTheDocument();
  });

  it('disables AI button while a pending suggestion is showing', () => {
    render(<YieldEditor {...baseProps()} suggestion={pendingSuggestion()} />);
    expect(screen.getByTestId('yield-suggest-button')).toBeDisabled();
  });

  it('renders citation URL + snippet + model in popover when toggled', () => {
    render(<YieldEditor {...baseProps()} suggestion={pendingSuggestion()} />);
    fireEvent.click(screen.getByTestId('yield-citation-toggle'));
    const url = screen.getByTestId('yield-citation-url');
    expect(url).toHaveAttribute('href', 'https://example.com/cited');
    expect(screen.getByTestId('yield-citation-snippet')).toHaveTextContent('Pelar la cebolla');
  });

  it('emits onAccept() with no tweak when "Aceptar" clicked', () => {
    const props = baseProps();
    render(<YieldEditor {...props} suggestion={pendingSuggestion()} />);
    fireEvent.click(screen.getByTestId('yield-accept-button'));
    expect(props.onAccept).toHaveBeenCalledTimes(1);
    expect(props.onAccept.mock.calls[0]).toEqual([]);
  });

  it('emits onAccept(tweakValue) when chef tweaks + clicks Aceptar tweak', () => {
    const props = baseProps();
    render(<YieldEditor {...props} suggestion={pendingSuggestion()} />);
    fireEvent.change(screen.getByTestId('yield-tweak-input'), { target: { value: '70' } });
    fireEvent.click(screen.getByTestId('yield-accept-tweak-button'));
    expect(props.onAccept).toHaveBeenCalledWith(0.7);
  });

  it('disables Aceptar tweak when input is empty', () => {
    render(<YieldEditor {...baseProps()} suggestion={pendingSuggestion()} />);
    expect(screen.getByTestId('yield-accept-tweak-button')).toBeDisabled();
  });
});

describe('YieldEditor — reject form', () => {
  it('shows the reject form when "Rechazar" clicked', () => {
    render(<YieldEditor {...baseProps()} suggestion={pendingSuggestion()} />);
    fireEvent.click(screen.getByTestId('yield-reject-button'));
    expect(screen.getByTestId('yield-reject-form')).toBeInTheDocument();
  });

  it('disables confirm when reason <10 chars', () => {
    render(<YieldEditor {...baseProps()} suggestion={pendingSuggestion()} />);
    fireEvent.click(screen.getByTestId('yield-reject-button'));
    fireEvent.change(screen.getByTestId('yield-reject-reason-input'), {
      target: { value: 'short' },
    });
    expect(screen.getByTestId('yield-reject-confirm-button')).toBeDisabled();
  });

  it('emits onReject(reason) with trimmed value on confirm', () => {
    const props = baseProps();
    render(<YieldEditor {...props} suggestion={pendingSuggestion()} />);
    fireEvent.click(screen.getByTestId('yield-reject-button'));
    fireEvent.change(screen.getByTestId('yield-reject-reason-input'), {
      target: { value: '   datos contradictorios con receta familiar   ' },
    });
    fireEvent.click(screen.getByTestId('yield-reject-confirm-button'));
    expect(props.onReject).toHaveBeenCalledWith('datos contradictorios con receta familiar');
  });

  it('cancels reject form on "Cancelar"', () => {
    render(<YieldEditor {...baseProps()} suggestion={pendingSuggestion()} />);
    fireEvent.click(screen.getByTestId('yield-reject-button'));
    fireEvent.click(screen.getByTestId('yield-reject-cancel-button'));
    expect(screen.queryByTestId('yield-reject-form')).toBeNull();
  });
});

describe('YieldEditor — terminal states', () => {
  it('renders accepted badge with effective value when status=accepted (no tweak)', () => {
    const sug = pendingSuggestion();
    sug.status = 'accepted';
    render(<YieldEditor {...baseProps()} suggestion={sug} />);
    expect(screen.getByTestId('yield-accepted-badge')).toHaveTextContent('Aceptado: 85%');
  });

  it('renders accepted badge with tweak annotation', () => {
    const sug = pendingSuggestion();
    sug.status = 'accepted';
    sug.acceptedValue = 0.7;
    render(<YieldEditor {...baseProps()} suggestion={sug} />);
    const badge = screen.getByTestId('yield-accepted-badge');
    expect(badge).toHaveTextContent('Aceptado: 70%');
    expect(badge).toHaveTextContent('IA sugirió 85%');
  });

  it('renders rejected badge when status=rejected', () => {
    const sug = pendingSuggestion();
    sug.status = 'rejected';
    render(<YieldEditor {...baseProps()} suggestion={sug} />);
    expect(screen.getByTestId('yield-rejected-badge')).toBeInTheDocument();
  });
});

describe('YieldEditor — iron-rule + error states', () => {
  it('shows manual-entry-only message when noCitationAvailable + no suggestion', () => {
    render(<YieldEditor {...baseProps()} noCitationAvailable />);
    expect(screen.getByTestId('yield-no-citation')).toHaveTextContent(
      'Manual entry only',
    );
  });

  it('renders inline error message when errorMessage prop set', () => {
    render(<YieldEditor {...baseProps()} errorMessage="Provider unreachable" />);
    expect(screen.getByTestId('yield-error')).toHaveTextContent('Provider unreachable');
  });

  it('group ARIA role + label for screen readers', () => {
    render(<YieldEditor {...baseProps()} />);
    expect(screen.getByRole('group', { name: /yield editor/i })).toBeInTheDocument();
  });

  it('disabled prop disables the input + AI button', () => {
    render(<YieldEditor {...baseProps()} disabled />);
    expect(screen.getByTestId('yield-input')).toBeDisabled();
    expect(screen.getByTestId('yield-suggest-button')).toBeDisabled();
  });
});
