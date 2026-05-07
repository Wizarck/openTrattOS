import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuditLogScreen } from './AuditLogScreen';

vi.mock('../lib/currentUser', () => ({
  useCurrentRole: vi.fn(),
  useCurrentOrgId: vi.fn(),
}));

import { useCurrentOrgId, useCurrentRole } from '../lib/currentUser';

const fetchMock = vi.fn();
const openMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  openMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  Object.defineProperty(window, 'open', { configurable: true, value: openMock });
});

function renderWithClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AuditLogScreen />
    </QueryClientProvider>,
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const sampleRow = {
  id: 'row-1',
  eventType: 'AGENT_ACTION_FORENSIC',
  aggregateType: 'recipe',
  aggregateId: '00000000-0000-4000-8000-000000000001',
  actorUserId: 'user-1',
  actorKind: 'agent',
  agentName: 'claude-desktop',
  payloadBefore: { name: 'old' },
  payloadAfter: { name: 'new' },
  reason: 'recipes.update',
  citationUrl: null,
  snippet: null,
  createdAt: '2026-05-08T12:34:56.000Z',
};

describe('AuditLogScreen', () => {
  it('Owner sees rows fetched from GET /audit-log', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('OWNER');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-1');
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ rows: [sampleRow], total: 1, limit: 50, offset: 0 }),
    );

    renderWithClient();
    // The pagination footer transitions from "0 de 0 eventos" to "1 de 1 eventos"
    // when query.data resolves and the effect copies rows into accumulated.
    await waitFor(() =>
      expect(screen.getByText('1 de 1 eventos')).toBeInTheDocument(),
    );
    // AGENT_ACTION_FORENSIC also appears in the filter checkbox; assert
    // unambiguously by reading the timestamp cell instead.
    expect(screen.getByText('2026-05-08 12:34:56')).toBeInTheDocument();
  });

  it('Manager also sees rows (any-of role guard)', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('MANAGER');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-1');
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ rows: [sampleRow], total: 1, limit: 50, offset: 0 }),
    );

    renderWithClient();
    await waitFor(() =>
      expect(screen.getByText('1 de 1 eventos')).toBeInTheDocument(),
    );
  });

  it('Staff sees access-denied fallback and zero fetches fire', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('STAFF');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-1');

    renderWithClient();

    expect(
      screen.getByText('Solo el Owner y el Manager pueden consultar la auditoría.'),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('clicking Apply with new filter refetches', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('OWNER');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-1');
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ rows: [sampleRow], total: 1, limit: 50, offset: 0 }),
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ rows: [], total: 0, limit: 50, offset: 0 }),
    );

    renderWithClient();
    await waitFor(() =>
      expect(screen.getByText('AGENT_ACTION_FORENSIC')).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByLabelText('AGENT_ACTION_FORENSIC'));
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));

    await waitFor(() => {
      const applyCalls = fetchMock.mock.calls.filter(([url]) =>
        String(url).includes('eventType=AGENT_ACTION_FORENSIC'),
      );
      expect(applyCalls.length).toBeGreaterThan(0);
    });
  });

  it('clicking Exportar CSV opens window.open with the export endpoint', async () => {
    vi.mocked(useCurrentRole).mockReturnValue('OWNER');
    vi.mocked(useCurrentOrgId).mockReturnValue('org-1');
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ rows: [], total: 0, limit: 50, offset: 0 }),
    );

    renderWithClient();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Exportar CSV' })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }));
    expect(openMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/audit-log/export.csv?'),
      '_blank',
      'noopener,noreferrer',
    );
  });
});
