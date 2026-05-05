import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AllergenBadge } from './AllergenBadge';

describe('AllergenBadge', () => {
  it('renders icon + text + accessible name on default', () => {
    render(<AllergenBadge allergen="gluten" />);
    const badge = screen.getByRole('status');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAccessibleName('Allergen: Gluten');
    expect(badge).toHaveTextContent('Gluten');
  });

  it('formats kebab-case allergen codes as Title Case', () => {
    render(<AllergenBadge allergen="tree-nuts" />);
    expect(screen.getByRole('status')).toHaveTextContent('Tree Nuts');
  });

  it('honours custom label override (i18n hook)', () => {
    render(<AllergenBadge allergen="milk" label="Lácteos" />);
    expect(screen.getByRole('status')).toHaveTextContent('Lácteos');
  });

  it('emphasised variant applies bolder weight + emphasis colour', () => {
    render(<AllergenBadge allergen="milk" emphasised />);
    const badge = screen.getByRole('status');
    // Inline style sets the emphasis bg explicitly so the test can introspect it.
    expect(badge.style.backgroundColor).toContain('var(--color-allergen-emphasis-bg)');
    expect(badge.className).toMatch(/font-semibold/);
  });

  it('cross-contamination variant prefixes "may contain" + dashed border', () => {
    render(<AllergenBadge allergen="peanuts" crossContamination />);
    const badge = screen.getByRole('status');
    expect(badge).toHaveAccessibleName('Cross-contamination warning: may contain Peanuts');
    expect(badge).toHaveTextContent(/may contain/i);
    expect(badge.style.borderStyle).toBe('dashed');
  });

  it('icon is aria-hidden so the screen-reader name comes from the label, not the icon', () => {
    const { container } = render(<AllergenBadge allergen="fish" />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it('accepts a custom aria-label override', () => {
    render(<AllergenBadge allergen="celery" aria-label="Apio (alérgeno declarado)" />);
    expect(screen.getByRole('status')).toHaveAccessibleName('Apio (alérgeno declarado)');
  });

  it('icon + text combination guards against colour-only differentiation (deuteranopia robustness)', () => {
    // Verifying structure: an SVG icon + a text node MUST both be present.
    const { container } = render(<AllergenBadge allergen="sesame" emphasised />);
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(container.textContent).toContain('Sesame');
  });

  it('renders multiple allergens as independent status regions', () => {
    render(
      <>
        <AllergenBadge allergen="gluten" />
        <AllergenBadge allergen="milk" />
        <AllergenBadge allergen="eggs" />
      </>,
    );
    const badges = screen.getAllByRole('status');
    expect(badges).toHaveLength(3);
  });

  it('forwards className for layout overrides', () => {
    const { container } = render(<AllergenBadge allergen="lupin" className="ml-4" />);
    const badge = container.querySelector('[role="status"]');
    expect(badge?.className).toMatch(/ml-4/);
  });
});
