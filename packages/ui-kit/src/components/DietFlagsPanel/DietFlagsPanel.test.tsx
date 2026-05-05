import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DietFlagsPanel } from './DietFlagsPanel';
import type { DietFlagsState } from './DietFlagsPanel.types';

const ASSERTED_ONLY: DietFlagsState = {
  asserted: ['vegetarian'],
  warnings: [],
};

const WITH_OVERRIDE: DietFlagsState = {
  asserted: ['vegetarian'],
  override: {
    value: ['vegan', 'vegetarian'],
    reason: 'Substituted butter with oil',
    appliedBy: 'Lourdes',
    appliedAt: '2026-05-04T18:42:11Z',
  },
};

const WITH_WARNINGS: DietFlagsState = {
  asserted: ['vegetarian'],
  warnings: ['Candidate vegan contradicted by milk'],
};

describe('DietFlagsPanel', () => {
  it('renders asserted flags as chips', () => {
    render(
      <DietFlagsPanel
        state={ASSERTED_ONLY}
        canOverride
        onApplyOverride={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    expect(screen.getByText('vegetarian')).toBeInTheDocument();
  });

  it('renders override value (not asserted) when override is present', () => {
    render(
      <DietFlagsPanel
        state={WITH_OVERRIDE}
        canOverride
        onApplyOverride={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    // Override has [vegan, vegetarian]; both should render.
    expect(screen.getByText('vegan')).toBeInTheDocument();
    expect(screen.getByText('vegetarian')).toBeInTheDocument();
  });

  it('renders override metadata (appliedBy + reason)', () => {
    render(
      <DietFlagsPanel
        state={WITH_OVERRIDE}
        canOverride
        onApplyOverride={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    expect(screen.getByText(/Lourdes/)).toBeInTheDocument();
    expect(screen.getByText(/Substituted butter with oil/)).toBeInTheDocument();
  });

  it('Override button is HIDDEN when canOverride=false (Staff)', () => {
    render(
      <DietFlagsPanel
        state={WITH_OVERRIDE}
        canOverride={false}
        onApplyOverride={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    expect(screen.queryByRole('button', { name: /Override/i })).not.toBeInTheDocument();
  });

  it('clicking Override opens a modal dialog with role="dialog"', () => {
    render(
      <DietFlagsPanel
        state={ASSERTED_ONLY}
        canOverride
        onApplyOverride={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Override/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('reason validation rejects <10 chars and shows alert', () => {
    const onApply = vi.fn().mockResolvedValue(undefined);
    render(
      <DietFlagsPanel
        state={ASSERTED_ONLY}
        canOverride
        onApplyOverride={onApply}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Override/i }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/at least 10 characters/i);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('valid reason (≥10 chars) submits and calls onApplyOverride', async () => {
    const onApply = vi.fn().mockResolvedValue(undefined);
    render(
      <DietFlagsPanel
        state={ASSERTED_ONLY}
        canOverride
        onApplyOverride={onApply}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Override/i }));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Confirmed by chef on 2026-05-05' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => {
      expect(onApply).toHaveBeenCalledWith(
        expect.objectContaining({
          value: expect.any(Array),
          reason: 'Confirmed by chef on 2026-05-05',
        }),
      );
    });
  });

  it('apply triggers optimistic update of visible flags', async () => {
    let resolveFn: (() => void) | null = null;
    const onApply = vi.fn().mockImplementation(
      () => new Promise<void>((res) => {
        resolveFn = res;
      }),
    );
    render(
      <DietFlagsPanel
        state={ASSERTED_ONLY}
        canOverride
        onApplyOverride={onApply}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Override/i }));
    // Toggle vegan ON
    fireEvent.click(screen.getByLabelText('vegan'));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Confirmed by chef on 2026-05-05' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    // Modal closes, optimistic update applies — vegan now visible
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(screen.getByText('vegan')).toBeInTheDocument();
    resolveFn?.();
  });

  it('rollback on rejection: reverts to original flags + shows alert', async () => {
    const onApply = vi.fn().mockRejectedValue(new Error('Backend rejected'));
    render(
      <DietFlagsPanel
        state={ASSERTED_ONLY}
        canOverride
        onApplyOverride={onApply}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Override/i }));
    fireEvent.click(screen.getByLabelText('vegan'));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Confirmed by chef on 2026-05-05' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Backend rejected');
    });
    // After rollback, only vegetarian (the original asserted flag) renders.
    expect(screen.queryByText('vegan')).not.toBeInTheDocument();
    expect(screen.getByText('vegetarian')).toBeInTheDocument();
  });

  it('Cancel button closes the modal without firing onApplyOverride', () => {
    const onApply = vi.fn();
    render(
      <DietFlagsPanel
        state={ASSERTED_ONLY}
        canOverride
        onApplyOverride={onApply}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Override/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('Escape key closes the modal', () => {
    render(
      <DietFlagsPanel
        state={ASSERTED_ONLY}
        canOverride
        onApplyOverride={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Override/i }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders warnings as role="note"', () => {
    render(
      <DietFlagsPanel
        state={WITH_WARNINGS}
        canOverride
        onApplyOverride={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    const notes = screen.getAllByRole('note');
    expect(notes).toHaveLength(1);
    expect(notes[0]).toHaveTextContent(/Candidate vegan contradicted by milk/);
  });

  it('respects custom minReasonLength prop', () => {
    render(
      <DietFlagsPanel
        state={ASSERTED_ONLY}
        canOverride
        minReasonLength={3}
        onApplyOverride={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Override/i }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'ab' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/at least 3 characters/i);
  });
});
