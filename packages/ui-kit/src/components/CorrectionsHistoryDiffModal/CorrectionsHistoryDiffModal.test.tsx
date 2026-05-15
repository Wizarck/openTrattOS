import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CorrectionsHistoryDiffModal } from './CorrectionsHistoryDiffModal';
import type { CorrectionsHistoryFieldDiff } from './CorrectionsHistoryDiffModal.types';
import type { CorrectionsHistoryEntry } from '../CorrectionsHistoryList/CorrectionsHistoryList.types';

const ENTRY: CorrectionsHistoryEntry = {
  correctionId: 'entry-1',
  correctedAt: '2026-05-14T10:00:00.000Z',
  correctedByUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  reason: 'Recount tras inventario',
  fieldsChanged: 3,
};

const DIFFS: CorrectionsHistoryFieldDiff[] = [
  { fieldName: 'lineItems[0].quantity', oldValue: '10', newValue: '12' },
  { fieldName: 'lineItems[0].unitPrice', oldValue: '1.50', newValue: '1.75' },
  { fieldName: 'supplierInvoiceRef', oldValue: null, newValue: 'INV-2026-3398' },
];

describe('CorrectionsHistoryDiffModal', () => {
  it('renders the dialog with title, timestamp, elided user, and reason', () => {
    render(
      <CorrectionsHistoryDiffModal
        entry={ENTRY}
        diffs={DIFFS}
        onClose={() => {}}
      />,
    );
    const modal = screen.getByTestId('corrections-history-diff-modal');
    expect(modal).toHaveAttribute('role', 'dialog');
    expect(modal).toHaveAttribute('aria-modal', 'true');
    expect(modal).toHaveTextContent('Detalle de corrección');
    expect(modal).toHaveTextContent('aaaaaaaa…');
    expect(modal).toHaveTextContent('Recount tras inventario');
    const time = modal.querySelector('time');
    expect(time?.getAttribute('datetime')).toBe('2026-05-14T10:00:00.000Z');
  });

  it('renders one row per diff with old → new values', () => {
    render(
      <CorrectionsHistoryDiffModal
        entry={ENTRY}
        diffs={DIFFS}
        onClose={() => {}}
      />,
    );
    const rows = screen.getAllByTestId('corrections-history-diff-row');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveAttribute('data-field-name', 'lineItems[0].quantity');
    expect(rows[0]).toHaveTextContent('10');
    expect(rows[0]).toHaveTextContent('12');
    expect(rows[2]).toHaveAttribute('data-field-name', 'supplierInvoiceRef');
    // The null oldValue is rendered as the empty-value placeholder.
    expect(rows[2]).toHaveTextContent('∅');
    expect(rows[2]).toHaveTextContent('INV-2026-3398');
  });

  it('renders the empty-state when diffs is []', () => {
    render(
      <CorrectionsHistoryDiffModal
        entry={ENTRY}
        diffs={[]}
        onClose={() => {}}
      />,
    );
    expect(
      screen.getByTestId('corrections-history-diff-empty'),
    ).toHaveTextContent('Sin cambios de campo registrados');
    expect(
      screen.queryByTestId('corrections-history-diff-list'),
    ).not.toBeInTheDocument();
  });

  it('omits the reason block when entry.reason is null', () => {
    render(
      <CorrectionsHistoryDiffModal
        entry={{ ...ENTRY, reason: null }}
        diffs={DIFFS}
        onClose={() => {}}
      />,
    );
    expect(
      screen.queryByText('Recount tras inventario'),
    ).not.toBeInTheDocument();
  });

  it('invokes onClose when the X button is clicked', () => {
    const onClose = vi.fn();
    render(
      <CorrectionsHistoryDiffModal
        entry={ENTRY}
        diffs={DIFFS}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByTestId('corrections-history-diff-modal-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('invokes onClose when the "Cerrar" footer button is clicked', () => {
    const onClose = vi.fn();
    render(
      <CorrectionsHistoryDiffModal
        entry={ENTRY}
        diffs={DIFFS}
        onClose={onClose}
      />,
    );
    // The X icon button and the footer button both have the name "Cerrar"
    // (one via aria-label, the other via visible text). Pick the footer
    // one by visible text content via the second match.
    const closeButtons = screen.getAllByRole('button', { name: 'Cerrar' });
    expect(closeButtons.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(closeButtons[closeButtons.length - 1]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('invokes onClose when ESC is pressed', () => {
    const onClose = vi.fn();
    render(
      <CorrectionsHistoryDiffModal
        entry={ENTRY}
        diffs={DIFFS}
        onClose={onClose}
      />,
    );
    fireEvent.keyDown(screen.getByTestId('corrections-history-diff-modal'), {
      key: 'Escape',
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('invokes onClose when the backdrop is clicked but NOT when the inner panel is clicked', () => {
    const onClose = vi.fn();
    render(
      <CorrectionsHistoryDiffModal
        entry={ENTRY}
        diffs={DIFFS}
        onClose={onClose}
      />,
    );
    // Clicking the modal container (backdrop) closes.
    fireEvent.click(screen.getByTestId('corrections-history-diff-modal'));
    expect(onClose).toHaveBeenCalledTimes(1);
    // Clicking a row (inside the inner panel) does NOT close — the inner
    // panel stops propagation. We assert by clicking the first diff row.
    const rows = screen.getAllByTestId('corrections-history-diff-row');
    fireEvent.click(rows[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
