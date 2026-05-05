import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { RecipePicker } from './RecipePicker';
import type { RecipeListItem } from './RecipePicker.types';

const SAMPLE: RecipeListItem[] = [
  { id: 'r1', name: 'tagliatelle', displayLabel: 'Tagliatelle ragù', isActive: true },
  { id: 'r2', name: 'pesto', displayLabel: 'Pesto', isActive: true },
  { id: 'r3', name: 'tarta', displayLabel: 'Tarta de manzana', isActive: false },
];

describe('RecipePicker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders combobox with collapsed listbox by default', () => {
    render(<RecipePicker recipes={[]} onSearch={vi.fn()} onSelect={vi.fn()} />);
    const input = screen.getByRole('combobox');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('opens listbox on focus', () => {
    render(<RecipePicker recipes={SAMPLE} onSearch={vi.fn()} onSelect={vi.fn()} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('debounces onSearch by 250ms', () => {
    const onSearch = vi.fn();
    render(<RecipePicker recipes={[]} onSearch={onSearch} onSelect={vi.fn()} />);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 't' } });
    fireEvent.change(input, { target: { value: 'ta' } });
    fireEvent.change(input, { target: { value: 'tag' } });
    expect(onSearch).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith('tag');
  });

  it('renders results as listbox options', () => {
    render(<RecipePicker recipes={SAMPLE} onSearch={vi.fn()} onSelect={vi.fn()} />);
    fireEvent.focus(screen.getByRole('combobox'));
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(3);
    expect(options[0]).toHaveTextContent('Tagliatelle ragù');
  });

  it('selects a result via mouse click and calls onSelect', () => {
    const onSelect = vi.fn();
    render(<RecipePicker recipes={SAMPLE} onSearch={vi.fn()} onSelect={onSelect} />);
    fireEvent.focus(screen.getByRole('combobox'));
    fireEvent.mouseDown(screen.getByText('Pesto'));
    fireEvent.click(screen.getByText('Pesto'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'r2' }));
  });

  it('keyboard navigation: ArrowDown highlights next, Enter selects', () => {
    const onSelect = vi.fn();
    render(<RecipePicker recipes={SAMPLE} onSearch={vi.fn()} onSelect={onSelect} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'r2' }));
  });

  it('Escape closes the listbox without selecting', () => {
    const onSelect = vi.fn();
    render(<RecipePicker recipes={SAMPLE} onSearch={vi.fn()} onSelect={onSelect} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('renders empty-state copy when recipes is empty', () => {
    render(
      <RecipePicker
        recipes={[]}
        onSearch={vi.fn()}
        onSelect={vi.fn()}
        emptyStateCopy="No matches"
      />,
    );
    fireEvent.focus(screen.getByRole('combobox'));
    expect(screen.getByText('No matches')).toBeInTheDocument();
  });

  it('renders loading state when loading=true', () => {
    render(
      <RecipePicker recipes={[]} onSearch={vi.fn()} onSelect={vi.fn()} loading />,
    );
    fireEvent.focus(screen.getByRole('combobox'));
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('marks inactive recipes with aria-disabled and visible (discontinued) label', () => {
    render(<RecipePicker recipes={SAMPLE} onSearch={vi.fn()} onSelect={vi.fn()} />);
    fireEvent.focus(screen.getByRole('combobox'));
    const tartaOpt = screen.getAllByRole('option').find((o) => o.textContent?.includes('Tarta'));
    expect(tartaOpt).toHaveAttribute('aria-disabled', 'true');
    expect(tartaOpt).toHaveTextContent(/discontinued/i);
  });

  it('activeOnly filter hides inactive recipes', () => {
    render(
      <RecipePicker recipes={SAMPLE} onSearch={vi.fn()} onSelect={vi.fn()} activeOnly />,
    );
    fireEvent.focus(screen.getByRole('combobox'));
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(2);
    expect(screen.queryByText(/Tarta/)).not.toBeInTheDocument();
  });

  it('controlled value prop syncs internal state', () => {
    const { rerender } = render(
      <RecipePicker recipes={[]} onSearch={vi.fn()} onSelect={vi.fn()} value="initial" />,
    );
    expect(screen.getByRole('combobox')).toHaveValue('initial');
    rerender(
      <RecipePicker recipes={[]} onSearch={vi.fn()} onSelect={vi.fn()} value="updated" />,
    );
    expect(screen.getByRole('combobox')).toHaveValue('updated');
  });

  it('aria-activedescendant updates as user navigates', () => {
    render(<RecipePicker recipes={SAMPLE} onSearch={vi.fn()} onSelect={vi.fn()} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toContain('-opt-r1');
  });

  it('forwards aria-label override', () => {
    render(
      <RecipePicker
        recipes={[]}
        onSearch={vi.fn()}
        onSelect={vi.fn()}
        aria-label="Pick a sub-recipe"
      />,
    );
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-label', 'Pick a sub-recipe');
  });
});
