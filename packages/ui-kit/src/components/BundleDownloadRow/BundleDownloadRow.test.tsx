import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { BundleDownloadRow } from './BundleDownloadRow';
import type { BundleDownloadSummary } from './BundleDownloadRow.types';

const BUNDLE: BundleDownloadSummary = {
  bundleId: 'b-1',
  sha256: 'a9f3…b274',
  auditLogId: 'AL-2026-189554',
  generatedAt: '2026-05-15T12:32:00Z',
  locale: 'es-ES',
  pdfSizeBytes: 2_300_000,
  pdfPageCount: 48,
  csvSizeBytes: 412_000,
};

describe('BundleDownloadRow', () => {
  it('renders the SHA-256 short form + audit_log id in the eyebrow', () => {
    render(
      <BundleDownloadRow
        bundle={BUNDLE}
        dispatchedRecipients={0}
        onDownloadPdf={() => {}}
        onDownloadCsv={() => {}}
      />,
    );
    expect(screen.getByText('a9f3…b274')).toBeInTheDocument();
    expect(screen.getByText('AL-2026-189554')).toBeInTheDocument();
  });

  it('renders the PDF download button with size + page count', () => {
    render(
      <BundleDownloadRow
        bundle={BUNDLE}
        dispatchedRecipients={0}
        onDownloadPdf={() => {}}
        onDownloadCsv={() => {}}
      />,
    );
    expect(
      screen.getByRole('button', { name: /Descargar PDF \(es-ES\)/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /48 páginas/ }),
    ).toBeInTheDocument();
  });

  it('PDF button fires onDownloadPdf when clicked', () => {
    const onPdf = vi.fn();
    render(
      <BundleDownloadRow
        bundle={BUNDLE}
        dispatchedRecipients={0}
        onDownloadPdf={onPdf}
        onDownloadCsv={() => {}}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Descargar PDF/ }),
    );
    expect(onPdf).toHaveBeenCalled();
  });

  it('CSV button fires onDownloadCsv when clicked', () => {
    const onCsv = vi.fn();
    render(
      <BundleDownloadRow
        bundle={BUNDLE}
        dispatchedRecipients={0}
        onDownloadPdf={() => {}}
        onDownloadCsv={onCsv}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Descargar CSV/ }),
    );
    expect(onCsv).toHaveBeenCalled();
  });

  it('renders the email-dispatched line when dispatchedRecipients > 0', () => {
    render(
      <BundleDownloadRow
        bundle={BUNDLE}
        dispatchedRecipients={2}
        onDownloadPdf={() => {}}
        onDownloadCsv={() => {}}
      />,
    );
    expect(
      screen.getByText(/Enviado a 2 destinatarios/),
    ).toBeInTheDocument();
  });

  it('hides the email-dispatched line when dispatchedRecipients === 0', () => {
    render(
      <BundleDownloadRow
        bundle={BUNDLE}
        dispatchedRecipients={0}
        onDownloadPdf={() => {}}
        onDownloadCsv={() => {}}
      />,
    );
    expect(screen.queryByText(/Enviado a/)).toBeNull();
  });
});
