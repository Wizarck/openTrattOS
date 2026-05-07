import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AuditLogFilters } from './AuditLogFilters';
import { EMPTY_AUDIT_FILTER_VALUES } from './AuditLogFilters.types';

const baseProps = {
  values: { ...EMPTY_AUDIT_FILTER_VALUES },
  onChange: vi.fn(),
  onApply: vi.fn(),
  onReset: vi.fn(),
  onExportCsv: vi.fn(),
};

describe('AuditLogFilters', () => {
  it('renders with default values (empty filter)', () => {
    render(<AuditLogFilters {...baseProps} />);
    expect(screen.getByText('Tipo de evento')).toBeInTheDocument();
    expect(screen.getByText('Agregado / Actor')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exportar CSV' })).toBeInTheDocument();
  });

  it('toggling an event-type checkbox calls onChange with the toggled value', () => {
    const onChange = vi.fn();
    render(<AuditLogFilters {...baseProps} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('AGENT_ACTION_FORENSIC'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: ['AGENT_ACTION_FORENSIC'] }),
    );
  });

  it('changing the aggregate-type select calls onChange', () => {
    const onChange = vi.fn();
    render(<AuditLogFilters {...baseProps} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Tipo de agregado'), {
      target: { value: 'recipe' },
    });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ aggregateType: 'recipe' }),
    );
  });

  it('clicking Apply calls onApply', () => {
    const onApply = vi.fn();
    render(<AuditLogFilters {...baseProps} onApply={onApply} />);
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(onApply).toHaveBeenCalled();
  });

  it('clicking Reset calls onReset', () => {
    const onReset = vi.fn();
    render(<AuditLogFilters {...baseProps} onReset={onReset} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(onReset).toHaveBeenCalled();
  });

  it('clicking Exportar CSV calls onExportCsv', () => {
    const onExportCsv = vi.fn();
    render(<AuditLogFilters {...baseProps} onExportCsv={onExportCsv} />);
    fireEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }));
    expect(onExportCsv).toHaveBeenCalled();
  });

  it('disables Apply and shows Aplicando… while applying', () => {
    render(<AuditLogFilters {...baseProps} applying />);
    const button = screen.getByRole('button', { name: 'Aplicando…' });
    expect(button).toBeDisabled();
  });
});
