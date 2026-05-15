import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { BundleArchiveTable } from './BundleArchiveTable';
import type { BundleArchiveRow } from './BundleArchiveTable.types';

function makeRow(i: number, archived = false): BundleArchiveRow {
  return {
    bundleId: `b-${i}`,
    generatedAt: `2026-05-${String(i).padStart(2, '0')}T12:00:00Z`,
    rangeLabel: '12 feb - 13 may 2026',
    locale: 'es-ES',
    scopeLabel: 'HACCP + Lot',
    generatedByActor: 'Iker Arana',
    sha256Short: `a${i}f3…b${i}74`,
    archived,
  };
}

describe('BundleArchiveTable', () => {
  it('renders the heading + a row per visible bundle', () => {
    render(
      <BundleArchiveTable
        rows={[makeRow(1), makeRow(2), makeRow(3)]}
        onDownload={() => {}}
      />,
    );
    expect(screen.getByText('Bundles anteriores')).toBeInTheDocument();
    const rows = screen
      .getAllByRole('row')
      .filter((r) => r.hasAttribute('data-bundle-id'));
    expect(rows.length).toBe(3);
  });

  it('caps the table at the limit (default 10)', () => {
    const many = Array.from({ length: 12 }, (_, i) => makeRow(i + 1));
    const { container } = render(
      <BundleArchiveTable rows={many} onDownload={() => {}} />,
    );
    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(10);
  });

  it('renders a custom limit when supplied', () => {
    const many = Array.from({ length: 12 }, (_, i) => makeRow(i + 1));
    const { container } = render(
      <BundleArchiveTable rows={many} limit={3} onDownload={() => {}} />,
    );
    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(3);
  });

  it('renders cold-storage rows with data-archived=true and a Restaurar link', () => {
    const { container } = render(
      <BundleArchiveTable
        rows={[makeRow(1, true), makeRow(2, false)]}
        onDownload={() => {}}
        onRestore={() => {}}
      />,
    );
    const archived = container.querySelector('[data-archived="true"]');
    expect(archived).not.toBeNull();
    expect(archived?.textContent).toContain('cold storage');
    expect(archived?.textContent).toContain('Restaurar →');
  });

  it('fires onDownload with the bundleId when a live-row link is clicked', () => {
    const onDownload = vi.fn();
    render(
      <BundleArchiveTable
        rows={[makeRow(1)]}
        onDownload={onDownload}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Descargar' }));
    expect(onDownload).toHaveBeenCalledWith('b-1');
  });

  it('renders an empty-state when rows is empty', () => {
    render(<BundleArchiveTable rows={[]} onDownload={() => {}} />);
    expect(
      screen.getByText('Sin bundles generados todavía.'),
    ).toBeInTheDocument();
  });
});
