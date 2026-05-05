import { AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/cn';
import type { AllergenBadgeProps } from './AllergenBadge.types';

/**
 * EU 1169/2011 Article 21 allergen badge. Always renders icon + text; never
 * colour-only (NFR Accessibility). The `emphasised` variant satisfies
 * Article 21's "conspicuous emphasis" requirement (bolder weight + ≥5:1
 * background contrast).
 *
 * Cross-contamination variant uses a dashed border + "may contain" prefix
 * per design.md §"Cross-contamination variant".
 */
export function AllergenBadge({
  allergen,
  emphasised = false,
  label,
  crossContamination = false,
  className,
  'aria-label': ariaLabel,
}: AllergenBadgeProps) {
  const visibleLabel = label ?? toTitleCase(allergen);
  const accessibleName =
    ariaLabel ??
    (crossContamination
      ? `Cross-contamination warning: may contain ${visibleLabel}`
      : `Allergen: ${visibleLabel}`);

  return (
    <span
      role="status"
      aria-label={accessibleName}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-sm font-semibold',
        'border',
        emphasised
          ? 'bg-(--color-allergen-emphasis-bg) text-(--color-allergen-emphasis-fg) border-(--color-allergen-emphasis-bg)'
          : 'bg-(--color-allergen-bg) text-(--color-allergen-fg) border-(--color-allergen-border)',
        crossContamination && 'border-dashed',
        className,
      )}
      style={{
        // Tailwind 4 var() escape — explicit fallbacks for cross-engine safety
        // (Storybook a11y addon parses inline styles too).
        backgroundColor: emphasised
          ? 'var(--color-allergen-emphasis-bg)'
          : 'var(--color-allergen-bg)',
        color: emphasised
          ? 'var(--color-allergen-emphasis-fg)'
          : 'var(--color-allergen-fg)',
        borderColor: emphasised
          ? 'var(--color-allergen-emphasis-bg)'
          : 'var(--color-allergen-border)',
        borderWidth: '1px',
        borderStyle: crossContamination ? 'dashed' : 'solid',
      }}
    >
      <AlertTriangle aria-hidden="true" size={14} strokeWidth={2.5} />
      <span>
        {crossContamination && (
          <span className="font-normal opacity-90">may contain </span>
        )}
        {visibleLabel}
      </span>
    </span>
  );
}

function toTitleCase(s: string): string {
  return s
    .split(/[\s-_]+/)
    .map((w) => (w.length === 0 ? '' : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ');
}
