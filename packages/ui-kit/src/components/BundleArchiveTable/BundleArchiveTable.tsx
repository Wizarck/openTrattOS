import { cn } from '../../lib/cn';
import type { BundleArchiveTableProps } from './BundleArchiveTable.types';

/**
 * j9 region #9 — past bundles archive (slice #15 m3-appcc-i18n-ui).
 *
 * Flat table of the last bundles for the operator's organisation.
 * Capped at `limit` (default 10 per slice #14's API). Cold-storage
 * rows (per ADR-029 retention archival) carry `data-archived="true"`
 * and render a `restaurar →` link (inert in v1).
 *
 * Per j9 §Decisions "Past bundles persist in an archive table on this
 * surface" — surfacing the archive on the same surface where new
 * bundles are generated keeps the inspector's "the bundle you sent me
 * in March" reference cheap.
 */
export function BundleArchiveTable({
  rows,
  limit = 10,
  onDownload,
  onRestore,
  className,
}: BundleArchiveTableProps) {
  const visible = rows.slice(0, limit);
  return (
    <section
      className={cn('mt-8', className)}
      data-component="bundle-archive-table"
      aria-label="Archivo de bundles"
    >
      <h2
        className="m-0 mb-2 text-lg font-medium"
        style={{ color: 'var(--color-ink)' }}
      >
        Bundles anteriores
      </h2>
      {visible.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--color-mute)' }}>
          Sin bundles generados todavía.
        </p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border-strong)' }}>
              <Th>Fecha</Th>
              <Th>Rango</Th>
              <Th>Idioma</Th>
              <Th>Alcance</Th>
              <Th>Generó</Th>
              <Th>SHA-256</Th>
              <Th>Acción</Th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr
                key={row.bundleId}
                style={{ borderTop: '1px solid var(--color-border)' }}
                data-bundle-id={row.bundleId}
                data-archived={row.archived ? 'true' : 'false'}
              >
                <Td>{formatGeneratedAt(row.generatedAt)}</Td>
                <Td>{row.rangeLabel}</Td>
                <Td>{row.locale}</Td>
                <Td>{row.scopeLabel}</Td>
                <Td>{row.generatedByActor}</Td>
                <Td>
                  <code
                    className="font-mono text-xs"
                    style={{ color: 'var(--color-mute)' }}
                    title={row.sha256Short}
                  >
                    {row.sha256Short}
                  </code>
                </Td>
                <Td>
                  {row.archived ? (
                    <>
                      <span
                        className="text-xs"
                        style={{ color: 'var(--color-mute)' }}
                      >
                        cold storage
                      </span>
                      {' · '}
                      <button
                        type="button"
                        onClick={() => onRestore?.(row.bundleId)}
                        className="bg-transparent text-sm"
                        style={{
                          color: 'var(--color-accent-press)',
                          padding: 0,
                          border: 'none',
                        }}
                      >
                        Restaurar →
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onDownload(row.bundleId)}
                      className="bg-transparent text-sm"
                      style={{
                        color: 'var(--color-accent-press)',
                        padding: 0,
                        border: 'none',
                      }}
                    >
                      Descargar
                    </button>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      className="text-left font-medium"
      style={{
        color: 'var(--color-mute)',
        padding: 'var(--space-sm, 12px)',
      }}
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td
      style={{
        padding: 'var(--space-sm, 12px)',
        color: 'var(--color-ink)',
      }}
    >
      {children}
    </td>
  );
}

function formatGeneratedAt(iso: string): string {
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
  } catch {
    return iso;
  }
}
