import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  TRANSPARENCY_BANNER_TEXT,
  TransparencyBanner,
} from './TransparencyBanner';

describe('TransparencyBanner', () => {
  it('renders the verbatim FR25 trust-principle text', () => {
    render(<TransparencyBanner />);
    const note = screen.getByRole('note');
    expect(note.textContent).toBe(TRANSPARENCY_BANNER_TEXT);
  });

  it('exports the locked text as a const so drift surfaces in tests', () => {
    expect(TRANSPARENCY_BANNER_TEXT).toContain(
      'El expediente contiene el audit_log sin editar como capítulo 0',
    );
    expect(TRANSPARENCY_BANNER_TEXT).toContain(
      'No producimos resumen ejecutivo.',
    );
  });

  it('accepts an optional className passthrough', () => {
    render(<TransparencyBanner className="custom-banner" />);
    const note = screen.getByRole('note');
    expect(note.className).toContain('custom-banner');
  });
});
