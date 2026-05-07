import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AuditLogRowDetail } from './AuditLogRowDetail';

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

describe('AuditLogRowDetail', () => {
  it('renders both payload columns when present', () => {
    render(
      <AuditLogRowDetail
        payloadBefore={{ a: 1 }}
        payloadAfter={{ a: 2 }}
        reason={null}
        citationUrl={null}
        snippet={null}
      />,
    );
    expect(screen.getByText('payload_before')).toBeInTheDocument();
    expect(screen.getByText('payload_after')).toBeInTheDocument();
    // JSON.stringify with 2-space indent
    expect(screen.getByText(/"a": 1/)).toBeInTheDocument();
    expect(screen.getByText(/"a": 2/)).toBeInTheDocument();
  });

  it('renders empty placeholders when payloads are null', () => {
    render(
      <AuditLogRowDetail
        payloadBefore={null}
        payloadAfter={null}
        reason={null}
        citationUrl={null}
        snippet={null}
      />,
    );
    const placeholders = screen.getAllByText('— vacío —');
    expect(placeholders).toHaveLength(2);
  });

  it('renders the citation URL as an external link when present', () => {
    render(
      <AuditLogRowDetail
        payloadBefore={null}
        payloadAfter={null}
        reason="manager override"
        citationUrl="https://example.com/x"
        snippet="external snippet text"
      />,
    );
    const link = screen.getByRole('link', { name: 'https://example.com/x' });
    expect(link).toHaveAttribute('href', 'https://example.com/x');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText('manager override')).toBeInTheDocument();
    expect(screen.getByText('external snippet text')).toBeInTheDocument();
  });

  it('copies JSON to clipboard when the copy button is clicked', async () => {
    render(
      <AuditLogRowDetail
        payloadBefore={{ a: 1 }}
        payloadAfter={null}
        reason={null}
        citationUrl={null}
        snippet={null}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Copiar payload_before' }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('{\n  "a": 1\n}');
  });
});
