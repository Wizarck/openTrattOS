import { cn } from '../../lib/cn';
import type { BundleDownloadRowProps } from './BundleDownloadRow.types';

/**
 * j9 region #8 — bundle download row (slice #15 m3-appcc-i18n-ui).
 *
 * Renders after `ExportProgressStrip` flips to `status === 'done'`. Two
 * ghost buttons (PDF + CSV) + a mute eyebrow with the SHA-256 hash +
 * audit_log entry id (inspector chain-of-custody at her fingertips per
 * j9 §Decisions "Bundle SHA-256 surfaces inline on the download row").
 * An optional third line surfaces dispatched-recipient confirmation.
 *
 * The hash + audit_log id are rendered as `<code>` so monospace +
 * tabular-nums lining is preserved in inspectors' visual review.
 */
export function BundleDownloadRow({
  bundle,
  dispatchedRecipients,
  onDownloadPdf,
  onDownloadCsv,
  className,
}: BundleDownloadRowProps) {
  return (
    <section
      className={cn('mt-4 rounded-md border-l-4 p-4 text-sm', className)}
      style={{
        backgroundColor: 'var(--color-surface)',
        borderLeftColor: 'var(--color-success)',
        border: '1px solid var(--color-success)',
        borderLeftWidth: '4px',
      }}
      data-component="bundle-download-row"
      data-bundle-id={bundle.bundleId}
      aria-label="Bundle generado"
    >
      <div className="flex items-center justify-between gap-3">
        <strong style={{ color: 'var(--color-ink)' }}>Bundle generado</strong>
        <span className="text-xs" style={{ color: 'var(--color-mute)' }}>
          {formatTime(bundle.generatedAt)}
        </span>
      </div>
      <div
        className="mt-2 text-xs"
        style={{ color: 'var(--color-mute)' }}
      >
        Firma SHA-256:{' '}
        <code
          className="font-mono"
          style={{
            color: 'var(--color-ink)',
            backgroundColor: 'var(--color-bg)',
            padding: '1px 6px',
            borderRadius: '3px',
            border: '1px solid var(--color-border)',
          }}
        >
          {bundle.sha256}
        </code>
        {' · audit_log '}
        <code
          className="font-mono"
          style={{ color: 'var(--color-ink)' }}
        >
          {bundle.auditLogId}
        </code>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onDownloadPdf}
          className="rounded-md border bg-transparent px-3 py-2 text-sm"
          style={{
            color: 'var(--color-ink)',
            borderColor: 'var(--color-border-strong)',
          }}
          data-action="download-pdf"
        >
          ↓ Descargar PDF ({bundle.locale}) ·{' '}
          {formatBytes(bundle.pdfSizeBytes)} · {bundle.pdfPageCount} páginas
        </button>
        <button
          type="button"
          onClick={onDownloadCsv}
          className="rounded-md border bg-transparent px-3 py-2 text-sm"
          style={{
            color: 'var(--color-ink)',
            borderColor: 'var(--color-border-strong)',
          }}
          data-action="download-csv"
        >
          ↓ Descargar CSV companion · {formatBytes(bundle.csvSizeBytes)}
        </button>
      </div>
      {dispatchedRecipients > 0 && (
        <p
          className="mt-3 text-xs"
          style={{ color: 'var(--color-success)' }}
        >
          ✓ Enviado a {dispatchedRecipients} destinatario
          {dispatchedRecipients === 1 ? '' : 's'} · entregado
        </p>
      )}
    </section>
  );
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) {
    return `${(bytes / 1_000_000).toFixed(1)} MB`;
  }
  if (bytes >= 1_000) {
    return `${Math.round(bytes / 1_000)} KB`;
  }
  return `${bytes} B`;
}

function formatTime(iso: string): string {
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return `Generado ${date.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
  } catch {
    return iso;
  }
}
