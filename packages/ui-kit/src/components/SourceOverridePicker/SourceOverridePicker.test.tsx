import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SourceOverridePicker } from './SourceOverridePicker';
import type { SupplierItemOption } from './SourceOverridePicker.types';

const PREFERRED_AND_OTHERS: SupplierItemOption[] = [
  { id: 's1', supplierName: 'Makro', price: 4.5, currency: 'EUR', isPreferred: true },
  { id: 's2', supplierName: 'Aldi', price: 5.2, currency: 'EUR', isPreferred: false },
  { id: 's3', supplierName: 'Carrefour', price: 4.8, currency: 'EUR', isPreferred: false },
];

const NO_PREFERRED: SupplierItemOption[] = [
  { id: 's2', supplierName: 'Aldi', price: 5.2, currency: 'EUR', isPreferred: false },
  { id: 's3', supplierName: 'Carrefour', price: 4.8, currency: 'EUR', isPreferred: false },
  { id: 's4', supplierName: 'Mercadona', price: 4.95, currency: 'EUR', isPreferred: false },
];

describe('SourceOverridePicker', () => {
  it('renders all options as radios in a radiogroup', () => {
    render(
      <SourceOverridePicker
        options={PREFERRED_AND_OTHERS}
        currentOverrideId={null}
        onApply={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });

  it('preferred option renders FIRST with visible Preferred badge', () => {
    render(
      <SourceOverridePicker
        options={PREFERRED_AND_OTHERS}
        currentOverrideId={null}
        onApply={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    const radios = screen.getAllByRole('radio');
    expect(radios[0]).toHaveAttribute('value', 's1'); // Makro is preferred
    expect(screen.getByText('Preferred')).toBeInTheDocument();
  });

  it('non-preferred options sort by price ascending tiebreaker', () => {
    render(
      <SourceOverridePicker
        options={NO_PREFERRED}
        currentOverrideId={null}
        onApply={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    const radios = screen.getAllByRole('radio');
    expect(radios[0]).toHaveAttribute('value', 's3'); // Carrefour 4.80
    expect(radios[1]).toHaveAttribute('value', 's4'); // Mercadona 4.95
    expect(radios[2]).toHaveAttribute('value', 's2'); // Aldi 5.20
  });

  it('preferred is selected by default when no currentOverrideId', () => {
    render(
      <SourceOverridePicker
        options={PREFERRED_AND_OTHERS}
        currentOverrideId={null}
        onApply={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    const preferredRadio = screen.getAllByRole('radio')[0];
    expect(preferredRadio).toBeChecked();
  });

  it('currentOverrideId selects the matching radio (recipe has explicit override)', () => {
    render(
      <SourceOverridePicker
        options={PREFERRED_AND_OTHERS}
        currentOverrideId="s2"
        onApply={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    const aldiRadio = screen.getAllByRole('radio').find((r) => r.getAttribute('value') === 's2');
    expect(aldiRadio).toBeChecked();
  });

  it('Apply button fires onApply with selected supplierItemId', () => {
    const onApply = vi.fn();
    render(
      <SourceOverridePicker
        options={PREFERRED_AND_OTHERS}
        currentOverrideId={null}
        onApply={onApply}
        onClear={vi.fn()}
      />,
    );
    const carrefourRadio = screen.getAllByRole('radio').find((r) => r.getAttribute('value') === 's3');
    fireEvent.click(carrefourRadio!);
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onApply).toHaveBeenCalledWith({ supplierItemId: 's3' });
  });

  it('"Use preferred" button is DISABLED when current selection is the preferred', () => {
    render(
      <SourceOverridePicker
        options={PREFERRED_AND_OTHERS}
        currentOverrideId={null}
        onApply={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Use preferred' })).toBeDisabled();
  });

  it('"Use preferred" button is ENABLED when override is active and fires onClear', () => {
    const onClear = vi.fn();
    render(
      <SourceOverridePicker
        options={PREFERRED_AND_OTHERS}
        currentOverrideId="s2"
        onApply={vi.fn()}
        onClear={onClear}
      />,
    );
    const useBtn = screen.getByRole('button', { name: 'Use preferred' });
    expect(useBtn).not.toBeDisabled();
    fireEvent.click(useBtn);
    expect(onClear).toHaveBeenCalled();
  });

  it('renders empty state when options is empty', () => {
    render(
      <SourceOverridePicker
        options={[]}
        currentOverrideId={null}
        onApply={vi.fn()}
        onClear={vi.fn()}
        emptyStateCopy="No suppliers"
      />,
    );
    expect(screen.getByText('No suppliers')).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });

  it('formats currency per locale (es-ES uses comma decimal separator)', () => {
    render(
      <SourceOverridePicker
        options={PREFERRED_AND_OTHERS}
        currentOverrideId={null}
        onApply={vi.fn()}
        onClear={vi.fn()}
        locale="es-ES"
      />,
    );
    // 4.50 EUR in es-ES → "4,50 €"
    expect(screen.getByText(/4,50/)).toBeInTheDocument();
  });

  it('formats currency per locale (en-US uses dollar symbol when currency=USD)', () => {
    const usd: SupplierItemOption[] = [
      { id: 'u1', supplierName: 'Acme', price: 4.5, currency: 'USD', isPreferred: true },
    ];
    render(
      <SourceOverridePicker
        options={usd}
        currentOverrideId={null}
        onApply={vi.fn()}
        onClear={vi.fn()}
        locale="en-US"
      />,
    );
    expect(screen.getByText(/\$4\.50/)).toBeInTheDocument();
  });

  it('clicking a different radio updates which is checked', () => {
    render(
      <SourceOverridePicker
        options={PREFERRED_AND_OTHERS}
        currentOverrideId={null}
        onApply={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    const aldiRadio = screen.getAllByRole('radio').find((r) => r.getAttribute('value') === 's2');
    fireEvent.click(aldiRadio!);
    expect(aldiRadio).toBeChecked();
  });
});
