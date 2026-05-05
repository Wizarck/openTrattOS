import { fireEvent, render, screen } from '@testing-library/react';
import { WasteFactorEditor } from './WasteFactorEditor';
import { AiSuggestionShape } from './WasteFactorEditor.types';

function baseProps() {
  return {
    value: 0.05,
    onChange: vi.fn(),
    aiEnabled: true,
    onRequestSuggestion: vi.fn(),
    onAccept: vi.fn(),
    onReject: vi.fn(),
  };
}

function suggestion(): AiSuggestionShape {
  return {
    id: 'sug-w',
    value: 0.05,
    citationUrl: 'https://example.com/braised',
    snippet: 'Salteado pierde ~5% de masa por evaporación',
    modelName: 'gpt-oss-20b-rag',
    status: 'pending',
  };
}

describe('WasteFactorEditor', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders with the waste-specific label + helpText', () => {
    render(<WasteFactorEditor {...baseProps()} />);
    expect(screen.getByLabelText(/factor de merma/i)).toBeInTheDocument();
  });

  it('uses the waste data-testid prefix (waste-input, waste-suggest-button)', () => {
    render(<WasteFactorEditor {...baseProps()} />);
    expect(screen.getByTestId('waste-input')).toBeInTheDocument();
    expect(screen.getByTestId('waste-suggest-button')).toBeInTheDocument();
  });

  it('shares the same accept + reject contract as YieldEditor', () => {
    const props = baseProps();
    render(<WasteFactorEditor {...props} suggestion={suggestion()} />);
    fireEvent.click(screen.getByTestId('waste-accept-button'));
    expect(props.onAccept).toHaveBeenCalledTimes(1);
    expect(props.onAccept.mock.calls[0]).toEqual([]);
  });

  it('emits onChange in fraction form on manual edit', () => {
    const props = baseProps();
    render(<WasteFactorEditor {...props} />);
    fireEvent.change(screen.getByTestId('waste-input'), { target: { value: '12' } });
    expect(props.onChange).toHaveBeenCalledWith(0.12);
  });
});
