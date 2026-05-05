import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { CostDeltaTable } from './CostDeltaTable';
import type { CostDeltaRow } from './CostDeltaTable.types';

const ROWS: CostDeltaRow[] = [
  {
    componentId: 'c1',
    componentName: 'Tomate Mutti',
    oldCost: 3.4,
    newCost: 4.1,
    deltaAbsolute: 0.7,
    deltaPercent: 0.2059,
    direction: 'increase',
    currency: 'EUR',
  },
  {
    componentId: 'c2',
    componentName: 'Aceite oliva',
    oldCost: 8.9,
    newCost: 7.95,
    deltaAbsolute: -0.95,
    deltaPercent: -0.1067,
    direction: 'decrease',
    currency: 'EUR',
  },
  {
    componentId: 'c3',
    componentName: 'Sal',
    oldCost: 0.4,
    newCost: 0.4,
    deltaAbsolute: 0,
    deltaPercent: 0,
    direction: 'unchanged',
    currency: 'EUR',
  },
];

describe('CostDeltaTable', () => {
  it('renders a table with 5 columns when rows present', () => {
    render(<CostDeltaTable rows={ROWS} />);
    const table = screen.getByRole('table');
    const headers = within(table).getAllByRole('columnheader');
    expect(headers).toHaveLength(5);
    expect(headers.map((h) => h.textContent)).toEqual([
      'Component',
      'Before',
      'After',
      'Δ%',
      'Δ€',
    ]);
  });

  it('renders one row per component with the displayed name', () => {
    render(<CostDeltaTable rows={ROWS} />);
    expect(screen.getByText('Tomate Mutti')).toBeInTheDocument();
    expect(screen.getByText('Aceite oliva')).toBeInTheDocument();
    expect(screen.getByText('Sal')).toBeInTheDocument();
  });

  it('sorts rows by absolute delta magnitude descending', () => {
    render(<CostDeltaTable rows={ROWS} />);
    const dataRows = screen.getAllByRole('row').slice(1); // drop header
    expect(dataRows[0].textContent).toContain('Aceite oliva'); // |0.95|
    expect(dataRows[1].textContent).toContain('Tomate Mutti'); // |0.70|
    expect(dataRows[2].textContent).toContain('Sal'); // |0.00|
  });

  it('increase row carries an upward arrow with the increase test id', () => {
    render(<CostDeltaTable rows={ROWS} />);
    expect(screen.getByTestId('delta-icon-increase')).toBeInTheDocument();
  });

  it('decrease row carries a downward arrow', () => {
    render(<CostDeltaTable rows={ROWS} />);
    expect(screen.getByTestId('delta-icon-decrease')).toBeInTheDocument();
  });

  it('unchanged row carries the muted minus icon', () => {
    render(<CostDeltaTable rows={ROWS} />);
    expect(screen.getByTestId('delta-icon-unchanged')).toBeInTheDocument();
  });

  it('arrow icons are aria-hidden so the row is not double-announced', () => {
    render(<CostDeltaTable rows={ROWS} />);
    const upArrow = screen.getByTestId('delta-icon-increase');
    expect(upArrow).toHaveAttribute('aria-hidden', 'true');
  });

  it('formats currency per locale (es-ES uses comma decimal)', () => {
    render(<CostDeltaTable rows={ROWS} locale="es-ES" />);
    // 4.10 EUR in es-ES → "4,10 €"
    expect(screen.getByText(/4,10\s*€/)).toBeInTheDocument();
  });

  it('formats percent with explicit sign on increase (+20.6%)', () => {
    render(<CostDeltaTable rows={ROWS} locale="en-US" />);
    expect(screen.getByText(/\+20\.6%/)).toBeInTheDocument();
  });

  it('formats percent with explicit sign on decrease (-10.7%)', () => {
    render(<CostDeltaTable rows={ROWS} locale="en-US" />);
    expect(screen.getByText(/-10\.7%/)).toBeInTheDocument();
  });

  it('renders empty-state copy when rows is []', () => {
    render(<CostDeltaTable rows={[]} emptyStateCopy="Nothing changed" />);
    expect(screen.getByText('Nothing changed')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders loading skeleton with aria-busy=true', () => {
    render(<CostDeltaTable rows={[]} loading />);
    const region = screen.getByRole('region');
    expect(region).toHaveAttribute('aria-busy', 'true');
  });

  it('renders dashes for null oldCost + null deltaPercent (component is new)', () => {
    const newComponent: CostDeltaRow[] = [
      {
        componentId: 'n1',
        componentName: 'New ingredient',
        oldCost: null,
        newCost: 4.0,
        deltaAbsolute: 4.0,
        deltaPercent: null,
        direction: 'increase',
        currency: 'EUR',
      },
    ];
    render(<CostDeltaTable rows={newComponent} />);
    // Both oldCost cell and deltaPercent cell render "—"; cells with values format normally.
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it('forwards caption prop as <caption>', () => {
    render(<CostDeltaTable rows={ROWS} caption="14-day window" />);
    const caption = screen.getByText('14-day window');
    expect(caption.tagName).toBe('CAPTION');
  });
});
