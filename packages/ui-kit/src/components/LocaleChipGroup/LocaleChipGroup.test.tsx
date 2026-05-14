import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LocaleChipGroup } from './LocaleChipGroup';

describe('LocaleChipGroup', () => {
  it('renders four chips inside a group with aria-label Idioma', () => {
    render(<LocaleChipGroup value="es-ES" onChange={() => {}} />);
    const group = screen.getByRole('group', { name: /Idioma/ });
    const chips = group.querySelectorAll('button');
    expect(chips.length).toBe(4);
  });

  it('renders exactly one chip with aria-pressed=true', () => {
    render(<LocaleChipGroup value="eu-ES" onChange={() => {}} />);
    const pressed = screen
      .getAllByRole('button')
      .filter((b) => b.getAttribute('aria-pressed') === 'true');
    expect(pressed.length).toBe(1);
    expect(pressed[0].textContent).toContain('Euskara (eu-ES)');
  });

  it('fires onChange with the clicked locale', () => {
    const onChange = vi.fn();
    render(<LocaleChipGroup value="es-ES" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Català/ }));
    expect(onChange).toHaveBeenCalledWith('ca-ES');
  });

  it('renders the canonical mute footer line', () => {
    render(<LocaleChipGroup value="es-ES" onChange={() => {}} />);
    expect(
      screen.getByText(
        /La localización determina el idioma de los encabezados/,
      ),
    ).toBeInTheDocument();
  });

  it('accepts a custom locales subset for testing', () => {
    render(
      <LocaleChipGroup
        value="ca-ES"
        onChange={() => {}}
        locales={[
          { value: 'ca-ES', shortLabel: 'CA', longLabel: 'Català (ca-ES)' },
          { value: 'gl-ES', shortLabel: 'GL', longLabel: 'Galego (gl-ES)' },
        ]}
      />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });
});
