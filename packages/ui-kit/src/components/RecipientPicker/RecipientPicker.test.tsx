import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RecipientPicker } from './RecipientPicker';
import type { RecipientOption } from './RecipientPicker.types';

const CONTACTS: RecipientOption[] = [
  { id: 'r-1', label: 'Marta Egaña', email: 'marta@inspeccion.gob' },
  { id: 'r-2', label: 'Seguros del Sur', email: 'siniestros@seguros.es' },
];

describe('RecipientPicker', () => {
  it('renders the collapsed strip by default with the configure button', () => {
    render(
      <RecipientPicker
        expanded={false}
        onToggleExpanded={() => {}}
        contacts={CONTACTS}
        selectedAddresses={[]}
        onChangeSelected={() => {}}
      />,
    );
    expect(screen.getByText(/Enviar también por email/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Configurar/ }),
    ).toBeInTheDocument();
  });

  it('fires onToggleExpanded(true) when the configure button is clicked', () => {
    const onToggle = vi.fn();
    render(
      <RecipientPicker
        expanded={false}
        onToggleExpanded={onToggle}
        contacts={CONTACTS}
        selectedAddresses={[]}
        onChangeSelected={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Configurar/ }));
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it('renders contacts as checkboxes when expanded', () => {
    render(
      <RecipientPicker
        expanded={true}
        onToggleExpanded={() => {}}
        contacts={CONTACTS}
        selectedAddresses={[]}
        onChangeSelected={() => {}}
      />,
    );
    expect(screen.getByText('Marta Egaña')).toBeInTheDocument();
    expect(screen.getByText('marta@inspeccion.gob')).toBeInTheDocument();
    expect(screen.getByText('Seguros del Sur')).toBeInTheDocument();
  });

  it('toggling a contact fires onChangeSelected with that email added', () => {
    const onChange = vi.fn();
    render(
      <RecipientPicker
        expanded={true}
        onToggleExpanded={() => {}}
        contacts={CONTACTS}
        selectedAddresses={[]}
        onChangeSelected={onChange}
      />,
    );
    fireEvent.click(screen.getByLabelText(/Marta Egaña/));
    expect(onChange).toHaveBeenCalledWith(['marta@inspeccion.gob']);
  });

  it('adding an ad-hoc address fires onChangeSelected with the new address appended', () => {
    const onChange = vi.fn();
    render(
      <RecipientPicker
        expanded={true}
        onToggleExpanded={() => {}}
        contacts={CONTACTS}
        selectedAddresses={[]}
        onChangeSelected={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Añadir destinatario ad-hoc/), {
      target: { value: 'extra@x.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Añadir' }));
    expect(onChange).toHaveBeenCalledWith(['extra@x.com']);
  });

  it('renders an ad-hoc selected address as a row tagged ad-hoc', () => {
    render(
      <RecipientPicker
        expanded={true}
        onToggleExpanded={() => {}}
        contacts={CONTACTS}
        selectedAddresses={['extra@x.com']}
        onChangeSelected={() => {}}
      />,
    );
    expect(screen.getByText('extra@x.com')).toBeInTheDocument();
    expect(screen.getByText('(ad-hoc)')).toBeInTheDocument();
  });
});
