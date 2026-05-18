import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StickySaveBar } from './StickySaveBar';

describe('StickySaveBar', () => {
  it('hides entirely when visible=false', () => {
    const { container } = render(
      <StickySaveBar visible={false} onPrimary={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows primary CTA + "Cambios sin guardar" label when visible', () => {
    render(<StickySaveBar visible onPrimary={vi.fn()} />);
    expect(screen.getByText('Cambios sin guardar')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Guardar cambios/ }),
    ).toBeInTheDocument();
  });

  it('calls onPrimary on click', () => {
    const onPrimary = vi.fn();
    render(<StickySaveBar visible onPrimary={onPrimary} />);
    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios/ }));
    expect(onPrimary).toHaveBeenCalled();
  });

  it('renders secondary CTA when onSecondary provided', () => {
    const onSecondary = vi.fn();
    render(
      <StickySaveBar
        visible
        onPrimary={vi.fn()}
        onSecondary={onSecondary}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Descartar/ }));
    expect(onSecondary).toHaveBeenCalled();
  });

  it('shows "Guardando…" when primaryPending=true', () => {
    render(<StickySaveBar visible primaryPending onPrimary={vi.fn()} />);
    expect(
      screen.getByRole('button', { name: 'Guardando…' }),
    ).toBeInTheDocument();
  });

  it('renders lastSavedAt as relative string when provided', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    render(
      <StickySaveBar visible onPrimary={vi.fn()} lastSavedAt={fiveMinAgo} />,
    );
    expect(screen.getByText(/Último guardado: hace 5 min/)).toBeInTheDocument();
  });

  it('renders custom message instead of lastSavedAt when both provided', () => {
    render(
      <StickySaveBar
        visible
        onPrimary={vi.fn()}
        lastSavedAt={new Date().toISOString()}
        message="Error al guardar — vuelve a intentarlo."
      />,
    );
    expect(
      screen.getByText('Error al guardar — vuelve a intentarlo.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Último guardado/)).not.toBeInTheDocument();
  });
});
