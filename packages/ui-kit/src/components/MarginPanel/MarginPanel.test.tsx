import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MarginPanel } from './MarginPanel';
import type { MarginReport } from './MarginPanel.types';

const base: MarginReport = {
  menuItemId: '11111111-1111-4111-8111-111111111111',
  organizationId: '22222222-2222-4222-8222-222222222222',
  recipeId: '33333333-3333-4333-8333-333333333333',
  locationId: '44444444-4444-4444-8444-444444444444',
  channel: 'DINE_IN',
  cost: 3.0,
  sellingPrice: 12.0,
  targetMargin: 0.6,
  marginAbsolute: 9.0,
  marginPercent: 0.75,
  marginVsTargetPp: 0.15,
  status: 'on_target',
  statusLabel: 'On target',
  warnings: [],
  recipeDiscontinued: false,
  currency: 'EUR',
};

describe('MarginPanel', () => {
  it('on_target renders the status label visibly + accessible name', () => {
    render(<MarginPanel report={base} />);
    expect(screen.getByText('On target')).toBeInTheDocument();
    expect(screen.getByRole('region')).toHaveAccessibleName(/On target/);
  });

  it('below_target renders its label', () => {
    render(
      <MarginPanel
        report={{
          ...base,
          status: 'below_target',
          statusLabel: 'Below target',
          marginVsTargetPp: -0.02,
        }}
      />,
    );
    expect(screen.getByText('Below target')).toBeInTheDocument();
  });

  it('at_risk renders its label', () => {
    render(
      <MarginPanel
        report={{ ...base, status: 'at_risk', statusLabel: 'At risk', marginVsTargetPp: -0.1 }}
      />,
    );
    expect(screen.getByText('At risk')).toBeInTheDocument();
  });

  it('unknown surfaces the first warning under the panel', () => {
    render(
      <MarginPanel
        report={{
          ...base,
          cost: null,
          marginPercent: null,
          marginAbsolute: null,
          marginVsTargetPp: null,
          status: 'unknown',
          statusLabel: 'Cost unknown',
          warnings: ['cost_unresolved: missing preferred SupplierItem'],
        }}
      />,
    );
    expect(screen.getByText('Cost unknown')).toBeInTheDocument();
    expect(screen.getByText(/cost_unresolved/)).toBeInTheDocument();
  });

  it('loading state renders a skeleton with aria-busy', () => {
    render(<MarginPanel report={null} loading />);
    const region = screen.getByRole('region');
    expect(region).toHaveAttribute('aria-busy', 'true');
  });

  it('formats currency via Intl.NumberFormat with the report currency', () => {
    render(<MarginPanel report={base} locale="en-US" />);
    // €12.00 in en-US locale rendering.
    expect(screen.getByText('€12.00')).toBeInTheDocument();
  });

  it('formats marginPercent with one decimal precision', () => {
    render(<MarginPanel report={base} locale="en-US" />);
    // marginPercent 0.75 → "75%"
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('renders an em-dash placeholder when cost is null', () => {
    const r = {
      ...base,
      cost: null,
      marginAbsolute: null,
      marginPercent: null,
      marginVsTargetPp: null,
      status: 'unknown' as const,
      statusLabel: 'Cost unknown',
    };
    render(<MarginPanel report={r} />);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it('shows the Discontinued hint when the parent Recipe is soft-deleted', () => {
    render(<MarginPanel report={{ ...base, recipeDiscontinued: true }} />);
    expect(screen.getByText(/Recipe discontinued/i)).toBeInTheDocument();
  });

  it('forwards className for layout overrides', () => {
    const { container } = render(<MarginPanel report={base} className="my-test-class" />);
    expect(container.firstChild).toHaveClass('my-test-class');
  });

  it('warnings are persistent (rendered as role="note" — not click-dismissible at this level)', () => {
    render(
      <MarginPanel
        report={{
          ...base,
          cost: null,
          status: 'unknown',
          statusLabel: 'Cost unknown',
          warnings: ['warn1', 'warn2'],
          marginPercent: null,
          marginAbsolute: null,
          marginVsTargetPp: null,
        }}
      />,
    );
    expect(screen.getAllByRole('note')).toHaveLength(2);
  });
});
