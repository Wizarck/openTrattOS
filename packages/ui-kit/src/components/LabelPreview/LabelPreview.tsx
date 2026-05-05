import { cn } from '../../lib/cn';
import {
  LABEL_PREVIEW_LOCALES,
  type LabelMissingFieldsError,
  type LabelPreviewProps,
} from './LabelPreview.types';

/**
 * EU 1169/2011 label preview. Embeds the streaming PDF returned by
 * `GET /recipes/:id/label?locale=` in an `<iframe>`, with locale switcher,
 * Print + Download actions, and inline error states for refusal-on-incomplete
 * (FR36 — names every missing Article 9 field) and unsupported locale.
 *
 * 3-click print flow (NFR): "Open Preview" → "Print" → consumer confirms.
 * Component stays presentation-only; the consuming hook owns the API calls.
 */
export function LabelPreview({
  recipeId,
  locale,
  onLocaleChange,
  previewUrl,
  onPrint,
  onDownload,
  error,
  loading = false,
  printing = false,
  printSuccessJobId,
  className,
}: LabelPreviewProps) {
  return (
    <div
      role="region"
      aria-label="Recipe label preview"
      className={cn('flex flex-col gap-3', className)}
      data-testid="label-preview"
      data-recipe-id={recipeId}
    >
      {/* Header — locale selector + actions */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <label className="flex items-center gap-2 text-sm">
          <span className="font-medium">Locale</span>
          <select
            aria-label="Label locale"
            value={locale}
            onChange={(e) =>
              onLocaleChange(e.target.value as (typeof LABEL_PREVIEW_LOCALES)[number])
            }
            className="rounded border border-border bg-surface-1 px-2 py-1 text-sm"
            disabled={loading}
            data-testid="label-locale-select"
          >
            {LABEL_PREVIEW_LOCALES.map((l) => (
              <option key={l} value={l}>
                {l.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Download label PDF"
            onClick={onDownload}
            disabled={loading || error != null}
            className={cn(
              'rounded border border-border bg-surface-1 px-3 py-1.5 text-sm font-medium',
              'hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50',
            )}
            data-testid="label-download-button"
          >
            Download
          </button>
          <button
            type="button"
            aria-label="Print label"
            onClick={onPrint}
            disabled={loading || printing || error != null}
            className={cn(
              'rounded bg-accent px-3 py-1.5 text-sm font-medium text-on-accent',
              'hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50',
            )}
            data-testid="label-print-button"
          >
            {printing ? 'Printing…' : 'Print Label'}
          </button>
        </div>
      </div>

      {/* Inline status / error messages */}
      {error != null && (
        <div
          role="alert"
          aria-live="polite"
          className="rounded border border-error bg-error-soft p-3 text-sm"
          data-testid="label-error"
        >
          {error.code === 'MISSING_MANDATORY_FIELDS' ? (
            <MissingFieldsBlock error={error as LabelMissingFieldsError} />
          ) : error.code === 'UNSUPPORTED_LOCALE' ? (
            <p data-testid="label-error-locale">
              Locale not supported. Pick one of:{' '}
              <strong>
                {(error as unknown as { supported: readonly string[] }).supported.join(', ')}
              </strong>
            </p>
          ) : error.code === 'PRINT_ADAPTER_NOT_CONFIGURED' ? (
            <p data-testid="label-error-adapter">
              No printer configured for this organization. The Owner must configure a print
              adapter before this label can be dispatched.
            </p>
          ) : (
            <p data-testid="label-error-generic">
              Unable to render the label ({error.code}).
            </p>
          )}
        </div>
      )}

      {printSuccessJobId && (
        <div
          role="status"
          aria-live="polite"
          className="rounded border border-success bg-success-soft p-2 text-sm"
          data-testid="label-print-success"
        >
          Sent to printer (job <code>{printSuccessJobId}</code>).
        </div>
      )}

      {/* Preview iframe */}
      {error == null && (
        <div
          className={cn(
            'rounded border border-border bg-surface-1',
            'min-h-[480px] flex',
            loading && 'animate-pulse',
          )}
          aria-busy={loading || undefined}
        >
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-sm text-muted">
              Rendering label…
            </div>
          ) : (
            <iframe
              title="Label preview"
              src={previewUrl}
              className="flex-1 min-h-[480px] w-full"
              data-testid="label-preview-iframe"
            />
          )}
        </div>
      )}
    </div>
  );
}

function MissingFieldsBlock({ error }: { error: LabelMissingFieldsError }) {
  return (
    <div data-testid="label-error-missing-fields">
      <p className="font-medium">
        Cannot render the label — required Article 9 fields are missing:
      </p>
      <ul className="mt-1 list-disc pl-5">
        {error.missing.map((field) => (
          <li key={field}>
            <code>{field}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}
