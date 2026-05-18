import { cn } from '../../lib/cn';
import type { EmptyStateCardProps } from './EmptyStateCard.types';

/**
 * Empty-state surface for widgets that have no data yet (slice #20
 * m3-ai-obs-ui, extended in audit v2 A-5).
 *
 * Per ADR-EMPTY-STATE, first-time orgs (zero `ai_usage_rollup` rows)
 * see this card instead of a broken-looking "—" placeholder or an
 * error. The card is the same size as the populated widget so the
 * grid layout doesn't shift between empty and populated states.
 *
 * v2 A-5 extensions:
 *   - Optional Icon prop (lucide-react) renders in an accent-soft
 *     circle above the headline.
 *   - Optional secondaryCta — typically "Ver con datos de ejemplo"
 *     so the page never feels dead-ended for first-run Owners.
 *   - Padding bumped from p-6 to p-8 sm:p-10 to give the surface room
 *     to breathe (v2 audit pattern #4 vertical emptiness).
 */
export function EmptyStateCard({
  title,
  body,
  Icon,
  ctaHref,
  ctaLabel,
  secondaryCtaHref,
  secondaryCtaLabel,
  className,
}: EmptyStateCardProps) {
  return (
    <div
      role="status"
      className={cn(
        'rounded-lg border border-dashed border-(--color-border-strong) p-8 text-center sm:p-10',
        className,
      )}
      style={{ borderColor: 'var(--color-border-strong)', borderStyle: 'dashed' }}
    >
      {Icon && (
        <div
          className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-(--color-accent-soft)"
          aria-hidden="true"
        >
          <Icon size={24} className="text-(--color-accent)" />
        </div>
      )}
      <p
        className="text-base font-medium text-(--color-ink)"
        style={{ color: 'var(--color-ink)' }}
      >
        {title}
      </p>
      {body && (
        <p
          className="mx-auto mt-2 max-w-md text-sm text-(--color-mute)"
          style={{ color: 'var(--color-mute)' }}
        >
          {body}
        </p>
      )}
      {(ctaHref || secondaryCtaHref) && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          {ctaHref && ctaLabel && (
            <a
              href={ctaHref}
              className="inline-flex items-center gap-2 rounded-md bg-(--color-accent) px-4 py-2 text-sm font-medium text-(--color-accent-fg) hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-(--color-focus)"
            >
              {ctaLabel}
            </a>
          )}
          {secondaryCtaHref && secondaryCtaLabel && (
            <a
              href={secondaryCtaHref}
              className="inline-flex items-center gap-2 text-sm text-(--color-accent-press) underline-offset-2 hover:underline"
              style={{ color: 'var(--color-accent-press)' }}
            >
              {secondaryCtaLabel}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
