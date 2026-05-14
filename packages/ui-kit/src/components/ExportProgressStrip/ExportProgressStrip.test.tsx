import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ExportProgressStrip } from './ExportProgressStrip';
import type { ProgressStep } from './ExportProgressStrip.types';

const STEPS: ProgressStep[] = [
  { key: 'index_audit_log', label: 'Indexando audit_log' },
  { key: 'compose_chapter_0', label: 'Componiendo capítulo 0' },
  { key: 'render_derivatives', label: 'Renderizando vistas derivativas' },
  { key: 'seal_hash', label: 'Sellando hash de bundle' },
  { key: 'done', label: 'Listo' },
];

describe('ExportProgressStrip', () => {
  it('renders with role=status and aria-live=polite', () => {
    render(
      <ExportProgressStrip
        steps={STEPS}
        currentStepIndex={0}
        status="in-progress"
      />,
    );
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
  });

  it('marks the active step active and pending steps pending', () => {
    const { container } = render(
      <ExportProgressStrip
        steps={STEPS}
        currentStepIndex={0}
        status="in-progress"
      />,
    );
    const items = container.querySelectorAll('[data-step-key]');
    expect(items[0].getAttribute('data-step-state')).toBe('active');
    expect(items[1].getAttribute('data-step-state')).toBe('pending');
    expect(items[4].getAttribute('data-step-state')).toBe('pending');
  });

  it('marks earlier steps done when advancing currentStepIndex', () => {
    const { container } = render(
      <ExportProgressStrip
        steps={STEPS}
        currentStepIndex={2}
        status="in-progress"
      />,
    );
    const items = container.querySelectorAll('[data-step-key]');
    expect(items[0].getAttribute('data-step-state')).toBe('done');
    expect(items[1].getAttribute('data-step-state')).toBe('done');
    expect(items[2].getAttribute('data-step-state')).toBe('active');
    expect(items[3].getAttribute('data-step-state')).toBe('pending');
  });

  it('marks all steps done when status=done', () => {
    const { container } = render(
      <ExportProgressStrip
        steps={STEPS}
        currentStepIndex={4}
        status="done"
      />,
    );
    const items = container.querySelectorAll('[data-step-key]');
    items.forEach((it) =>
      expect(it.getAttribute('data-step-state')).toBe('done'),
    );
  });

  it('renders the failed step destructive and mounts the retry button', () => {
    const onRetry = vi.fn();
    const { container } = render(
      <ExportProgressStrip
        steps={STEPS}
        currentStepIndex={3}
        status="failed"
        onRetry={onRetry}
      />,
    );
    const items = container.querySelectorAll('[data-step-key]');
    expect(items[3].getAttribute('data-step-state')).toBe('failed');
    const retry = screen.getByRole('button', { name: 'Reintentar' });
    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalled();
  });

  it('renders byte + page count live meta when provided', () => {
    render(
      <ExportProgressStrip
        steps={STEPS}
        currentStepIndex={2}
        status="in-progress"
        sizeBytes={2_300_000}
        pageCount={48}
      />,
    );
    expect(screen.getByText(/~48 páginas/)).toBeInTheDocument();
    expect(screen.getByText(/~2\.3 MB/)).toBeInTheDocument();
  });
});
