import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { IngredientPicker } from './IngredientPicker';
import type { IngredientListItem } from './IngredientPicker.types';

const LOCAL: IngredientListItem[] = [
  { id: 'i1', name: 'tomate', brandName: null, barcode: null, displayLabel: 'Tomate', isActive: true },
  { id: 'i2', name: 'cebolla', brandName: null, barcode: null, displayLabel: 'Cebolla', isActive: true },
];

const OFF: IngredientListItem[] = [
  {
    id: 'i10',
    name: 'tomate mutti',
    brandName: 'Mutti',
    barcode: '8005110001234',
    displayLabel: 'Tomate triturado',
    isActive: true,
  },
];

describe('IngredientPicker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders combobox closed by default', () => {
    render(<IngredientPicker ingredients={[]} onSearch={vi.fn()} onSelect={vi.fn()} />);
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false');
  });

  it('local-only mode renders only the displayLabel (no brand/barcode lines)', () => {
    render(<IngredientPicker ingredients={LOCAL} onSearch={vi.fn()} onSelect={vi.fn()} />);
    fireEvent.focus(screen.getByRole('combobox'));
    expect(screen.getByText('Tomate')).toBeInTheDocument();
    expect(screen.getByText('Cebolla')).toBeInTheDocument();
    // Brand placeholder should not exist for null fields.
    expect(screen.queryByText('Mutti')).not.toBeInTheDocument();
  });

  it('OFF-enriched mode renders 3 lines: name + brand + barcode', () => {
    render(<IngredientPicker ingredients={OFF} onSearch={vi.fn()} onSelect={vi.fn()} />);
    fireEvent.focus(screen.getByRole('combobox'));
    expect(screen.getByText('Tomate triturado')).toBeInTheDocument();
    expect(screen.getByText('Mutti')).toBeInTheDocument();
    expect(screen.getByText('8005110001234')).toBeInTheDocument();
  });

  it('barcode line uses monospace font (var(--font-mono))', () => {
    render(<IngredientPicker ingredients={OFF} onSearch={vi.fn()} onSelect={vi.fn()} />);
    fireEvent.focus(screen.getByRole('combobox'));
    const barcode = screen.getByText('8005110001234');
    expect(barcode.style.fontFamily).toContain('var(--font-mono)');
  });

  it('debounces onSearch by 250ms', () => {
    const onSearch = vi.fn();
    render(<IngredientPicker ingredients={[]} onSearch={onSearch} onSelect={vi.fn()} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'tom' } });
    expect(onSearch).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(onSearch).toHaveBeenCalledWith('tom');
  });

  it('keyboard nav: ArrowDown then Enter selects', () => {
    const onSelect = vi.fn();
    render(<IngredientPicker ingredients={LOCAL} onSearch={vi.fn()} onSelect={onSelect} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'i1' }));
  });

  it('mouse click on result calls onSelect', () => {
    const onSelect = vi.fn();
    render(<IngredientPicker ingredients={LOCAL} onSearch={vi.fn()} onSelect={onSelect} />);
    fireEvent.focus(screen.getByRole('combobox'));
    fireEvent.mouseDown(screen.getByText('Cebolla'));
    fireEvent.click(screen.getByText('Cebolla'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'i2' }));
  });

  it('renders empty state when ingredients is empty', () => {
    render(
      <IngredientPicker
        ingredients={[]}
        onSearch={vi.fn()}
        onSelect={vi.fn()}
        emptyStateCopy="Sin coincidencias"
      />,
    );
    fireEvent.focus(screen.getByRole('combobox'));
    expect(screen.getByText('Sin coincidencias')).toBeInTheDocument();
  });

  it('renders loading state', () => {
    render(<IngredientPicker ingredients={[]} loading onSearch={vi.fn()} onSelect={vi.fn()} />);
    fireEvent.focus(screen.getByRole('combobox'));
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('Escape closes listbox', () => {
    render(<IngredientPicker ingredients={LOCAL} onSearch={vi.fn()} onSelect={vi.fn()} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  it('controlled value prop syncs internal state', () => {
    const { rerender } = render(
      <IngredientPicker ingredients={[]} onSearch={vi.fn()} onSelect={vi.fn()} value="butter" />,
    );
    expect(screen.getByRole('combobox')).toHaveValue('butter');
    rerender(
      <IngredientPicker ingredients={[]} onSearch={vi.fn()} onSelect={vi.fn()} value="oil" />,
    );
    expect(screen.getByRole('combobox')).toHaveValue('oil');
  });

  it('forwards aria-label override', () => {
    render(
      <IngredientPicker
        ingredients={[]}
        onSearch={vi.fn()}
        onSelect={vi.fn()}
        aria-label="Search by brand or barcode"
      />,
    );
    expect(screen.getByRole('combobox')).toHaveAttribute(
      'aria-label',
      'Search by brand or barcode',
    );
  });
});
