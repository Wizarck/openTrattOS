import { useState } from 'react';
import { cn } from '../../lib/cn';
import type { AuditLogRowDetailProps } from './AuditLogRowDetail.types';

/**
 * Renders an audit_log row's payload_before + payload_after side-by-side
 * with copy-to-clipboard buttons. Below the payloads, surfaces reason +
 * citationUrl + snippet when present.
 *
 * Each `<pre>` is bounded with max-h-96 + overflow-auto so large payloads
 * (>2KB) don't dominate the page; the copy button gives operators the full
 * content. Per ADR (m2-audit-log-ui design SD5), copy-to-clipboard fails
 * gracefully on browsers without clipboard API access.
 */
export function AuditLogRowDetail({
  payloadBefore,
  payloadAfter,
  reason,
  citationUrl,
  snippet,
}: AuditLogRowDetailProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <PayloadPanel title="payload_before" value={payloadBefore} />
        <PayloadPanel title="payload_after" value={payloadAfter} />
      </div>
      {(reason || citationUrl || snippet) && (
        <div className="space-y-1 rounded border border-border-subtle bg-surface p-3 text-xs">
          {reason && (
            <p>
              <span className="font-semibold text-mute">Razón: </span>
              <span>{reason}</span>
            </p>
          )}
          {citationUrl && (
            <p>
              <span className="font-semibold text-mute">Cita: </span>
              <a
                href={citationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-ink"
              >
                {citationUrl}
              </a>
            </p>
          )}
          {snippet && (
            <p>
              <span className="font-semibold text-mute">Extracto: </span>
              <span className="italic">{snippet}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function PayloadPanel({ title, value }: { title: string; value: unknown }) {
  const [copied, setCopied] = useState(false);
  const json = formatJson(value);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Browser refused (HTTP non-localhost / permission denied). Fail soft.
      // eslint-disable-next-line no-console
      console.warn('No se pudo copiar al portapapeles');
    }
  };

  return (
    <div className="rounded border border-border-subtle bg-surface">
      <div className="flex items-center justify-between border-b border-border-subtle px-2 py-1">
        <span className="font-mono text-[10px] uppercase tracking-wide text-mute">{title}</span>
        <button
          type="button"
          onClick={onCopy}
          disabled={value === null || value === undefined}
          className={cn(
            'rounded border border-border-subtle px-2 py-0.5 text-[10px] hover:bg-surface-muted',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
          aria-label={`Copiar ${title}`}
        >
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      {value === null || value === undefined ? (
        <p className="px-2 py-2 text-xs italic text-mute">— vacío —</p>
      ) : (
        <pre className="max-h-96 overflow-auto px-2 py-2 text-[11px] leading-tight">{json}</pre>
      )}
    </div>
  );
}

function formatJson(value: unknown): string {
  if (value === null || value === undefined) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
