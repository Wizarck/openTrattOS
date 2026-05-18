import type { LucideIcon } from 'lucide-react';

export interface EmptyStateCardProps {
  /** Headline copy (e.g. "Sin actividad en los últimos 30 días"). */
  title: string;
  /** Body copy explaining the empty state + next step. */
  body?: string;
  /**
   * Audit v2 A-5: optional lucide-react icon rendered in an accent-soft
   * circle above the headline. Centres the empty state visually and
   * mirrors the iconography established in OnboardingComplete's "Listo".
   */
  Icon?: LucideIcon;
  /** Optional CTA link target (e.g. "/owner-settings#ai-providers"). */
  ctaHref?: string;
  /** Optional CTA link text. */
  ctaLabel?: string;
  /**
   * Audit v2 A-5: optional secondary CTA — typically the "Ver con datos
   * de ejemplo" demo-data toggle (v1 L2-4 never shipped).
   */
  secondaryCtaHref?: string;
  secondaryCtaLabel?: string;
  className?: string;
}
