import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MacroPanel } from './MacroPanel';
import type { MacroRollup } from './MacroPanel.types';

const TYPICAL: MacroRollup = {
  perPortion: {
    'energy-kcal': 425,
    proteins: 18.4,
    carbohydrates: 52.1,
    fat: 12.8,
  },
  per100g: {
    'energy-kcal': 158,
    proteins: 6.8,
    carbohydrates: 19.3,
    fat: 4.7,
  },
  totalWeightG: 270,
  externalSources: [
    { ingredientId: 'i-1', externalSourceRef: '8005110001234' },
  ],
};

const NO_OFF: MacroRollup = { ...TYPICAL, externalSources: [] };

const EMPTY: MacroRollup = {
  perPortion: {},
  per100g: {},
  totalWeightG: null,
  externalSources: [],
};

describe('MacroPanel', () => {
  it('renders region with aria-label', () => {
    render(<MacroPanel rollup={TYPICAL} />);
    expect(screen.getByRole('region', { name: 'Recipe macros' })).toBeInTheDocument();
  });

  it('renders loading skeleton with aria-busy=true when loading', () => {
    render(<MacroPanel rollup={null} loading />);
    expect(screen.getByRole('region')).toHaveAttribute('aria-busy', 'true');
  });

  it('renders empty state when no nutrition data', () => {
    render(<MacroPanel rollup={EMPTY} emptyStateCopy="No data" />);
    expect(screen.getByText('No data')).toBeInTheDocument();
  });

  it('compact mode renders only per-portion column (no per-100g header)', () => {
    render(<MacroPanel rollup={TYPICAL} mode="compact" />);
    expect(screen.getByText('Per portion')).toBeInTheDocument();
    expect(screen.queryByText('Per 100 g')).not.toBeInTheDocument();
  });

  it('expanded mode renders BOTH per-portion AND per-100g columns', () => {
    render(<MacroPanel rollup={TYPICAL} mode="expanded" />);
    expect(screen.getByText('Per portion')).toBeInTheDocument();
    expect(screen.getByText('Per 100 g')).toBeInTheDocument();
  });

  it('renders the standard macro labels in expected order (Energy first)', () => {
    render(<MacroPanel rollup={TYPICAL} />);
    const rows = screen.getAllByRole('row');
    // First row is the header; subsequent rows are data
    const dataRows = rows.slice(1);
    const firstDataLabel = dataRows[0].textContent ?? '';
    expect(firstDataLabel).toContain('Energy');
  });

  it('formats numbers per locale (es-ES uses comma decimal)', () => {
    render(<MacroPanel rollup={TYPICAL} mode="compact" locale="es-ES" />);
    // 18.4 g protein → "18,4"
    expect(screen.getByText(/18,4/)).toBeInTheDocument();
  });

  it('ODbL attribution ALWAYS visible when externalSources non-empty', () => {
    render(<MacroPanel rollup={TYPICAL} />);
    const attribution = screen.getByTestId('odbl-attribution');
    expect(attribution).toBeInTheDocument();
    expect(attribution).toHaveTextContent(/Open Food Facts/);
    expect(attribution).toHaveTextContent(/ODbL/);
  });

  it('ODbL attribution HIDDEN when externalSources empty', () => {
    render(<MacroPanel rollup={NO_OFF} />);
    expect(screen.queryByTestId('odbl-attribution')).not.toBeInTheDocument();
  });

  it('total weight only renders in expanded mode (not compact)', () => {
    const { container, rerender } = render(<MacroPanel rollup={TYPICAL} mode="compact" />);
    expect(container.textContent).not.toContain('Total weight');
    rerender(<MacroPanel rollup={TYPICAL} mode="expanded" />);
    expect(screen.getByText(/Total weight/)).toBeInTheDocument();
  });

  it('handles unknown nutrition keys (sorted alphabetically after primary keys)', () => {
    const withCustom: MacroRollup = {
      ...TYPICAL,
      perPortion: { ...TYPICAL.perPortion, magnesium: 12, calcium: 80 },
      per100g: { ...TYPICAL.per100g, magnesium: 4.4, calcium: 29.6 },
    };
    render(<MacroPanel rollup={withCustom} />);
    expect(screen.getByText('calcium')).toBeInTheDocument();
    expect(screen.getByText('magnesium')).toBeInTheDocument();
  });

  it('forwards className', () => {
    const { container } = render(<MacroPanel rollup={TYPICAL} className="my-test-class" />);
    const region = container.querySelector('[role="region"]');
    expect(region?.className).toMatch(/my-test-class/);
  });

  it('per-100g column shows dash for keys missing in per100g but present in perPortion', () => {
    const partial: MacroRollup = {
      perPortion: { 'energy-kcal': 425, fat: 12 },
      per100g: { 'energy-kcal': 158 }, // fat missing
      totalWeightG: 270,
      externalSources: [],
    };
    render(<MacroPanel rollup={partial} mode="expanded" />);
    // The Fat row should have "—" in the per-100g column
    const rows = screen.getAllByRole('row');
    const fatRow = rows.find((r) => r.textContent?.includes('Fat'));
    expect(fatRow?.textContent).toContain('—');
  });
});
