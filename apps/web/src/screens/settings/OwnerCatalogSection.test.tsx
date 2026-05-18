import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { OwnerCatalogSection } from './OwnerCatalogSection';

vi.mock('../../lib/currentUser', () => ({
  useCurrentOrgId: vi.fn(),
}));
import { useCurrentOrgId } from '../../lib/currentUser';

const ORG = '11111111-1111-4111-8111-111111111111';
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.mocked(useCurrentOrgId).mockReturnValue(ORG);
  global.fetch = fetchMock as unknown as typeof fetch;
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function renderSurface() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <OwnerCatalogSection />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('OwnerCatalogSection', () => {
  it('shows login fallback when no org id is set', () => {
    vi.mocked(useCurrentOrgId).mockReturnValue(undefined);
    renderSurface();
    expect(screen.getByText(/Inicia sesión para gestionar tu catálogo/)).toBeInTheDocument();
  });

  it('renders both cards (Categorías + Unidades de medida) after data loads', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse([])) // categories tree
      .mockResolvedValueOnce(
        jsonResponse([
          { code: 'kg', label: 'kilogram', family: 'WEIGHT', factor: 1000 },
          { code: 'L', label: 'litre', family: 'VOLUME', factor: 1000 },
          { code: 'pcs', label: 'piece', family: 'UNIT', factor: 1 },
        ]),
      );

    renderSurface();
    await waitFor(() => screen.getByText('Categorías'));
    expect(screen.getByText('Unidades de medida')).toBeInTheDocument();
    await waitFor(() => screen.getByText('kg'));
    expect(screen.getByText('L')).toBeInTheDocument();
    expect(screen.getByText('pcs')).toBeInTheDocument();
  });

  it('lists existing categories and lets the user delete one', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse([
          {
            id: 'c1',
            organizationId: ORG,
            parentId: null,
            name: 'pescados',
            nameEs: 'Pescados',
            nameEn: 'Fish',
            sortOrder: 0,
            isDefault: false,
            createdAt: '2026-05-01T10:00:00Z',
            updatedAt: '2026-05-01T10:00:00Z',
          },
        ]),
      )
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({ data: { id: 'c1' }, missingFields: [], nextRequired: null }))
      .mockResolvedValueOnce(jsonResponse([]));

    renderSurface();
    await waitFor(() => screen.getByText('Pescados'));
    fireEvent.click(screen.getByLabelText('Eliminar Pescados'));

    await waitFor(() => {
      const delCall = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === 'DELETE',
      );
      expect(delCall).toBeDefined();
      expect(String(delCall?.[0])).toContain('/api/categories/c1');
    });
  });

  it('posts a new category with the typed name in name/nameEs/nameEn', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            id: 'c1',
            organizationId: ORG,
            parentId: null,
            name: 'Bebidas',
            nameEs: 'Bebidas',
            nameEn: 'Bebidas',
            sortOrder: 0,
            isDefault: false,
            createdAt: '2026-05-18T10:00:00Z',
            updatedAt: '2026-05-18T10:00:00Z',
          },
          missingFields: [],
          nextRequired: null,
        }),
      )
      .mockResolvedValueOnce(jsonResponse([]));

    renderSurface();
    await waitFor(() => screen.getByLabelText(/Nombre de la categoría/));

    fireEvent.change(screen.getByLabelText(/Nombre de la categoría/), {
      target: { value: 'Bebidas' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Añadir categoría/ }));

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url).includes('/api/categories') &&
          (init as RequestInit | undefined)?.method === 'POST',
      );
      expect(postCall).toBeDefined();
      const body = JSON.parse(((postCall![1] as RequestInit).body ?? '{}') as string);
      expect(body.name).toBe('Bebidas');
      expect(body.nameEs).toBe('Bebidas');
      expect(body.nameEn).toBe('Bebidas');
      expect(body.organizationId).toBe(ORG);
    });
  });

  it('surfaces a categories load error as role=alert', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('boom', { status: 500 }))
      .mockResolvedValueOnce(jsonResponse([]));

    renderSurface();
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });
});

// ============================================================================
// Sprint 4 W2-3b — Categories CSV import flow
// ============================================================================

function envelope<T>(data: T): unknown {
  return { data, missingFields: [], nextRequired: null };
}

function makeCsvFile(name = 'cats.csv', body = 'nombre,padre,color\nFoo,,#FFB347\n'): File {
  return new File([body], name, { type: 'text/csv' });
}

describe('OwnerCatalogSection · CSV import', () => {
  beforeEach(() => {
    // Initial categories tree + UoM listing for every test in this block.
    fetchMock.mockReset();
    vi.mocked(useCurrentOrgId).mockReturnValue(ORG);
    global.fetch = fetchMock as unknown as typeof fetch;
    fetchMock
      .mockResolvedValueOnce(jsonResponse([])) // categories tree
      .mockResolvedValueOnce(jsonResponse([])); // uoms
  });

  it('opens the CSV import modal when the "Importar CSV" button is clicked', async () => {
    renderSurface();
    await waitFor(() => screen.getByRole('button', { name: /Importar CSV/ }));

    fireEvent.click(screen.getByRole('button', { name: /Importar CSV/ }));

    await waitFor(() => screen.getByTestId('categories-import-modal'));
    const modal = screen.getByTestId('categories-import-modal');
    expect(within(modal).getByText(/Importar categorías desde CSV/)).toBeInTheDocument();
    expect(within(modal).getByText(/Arrastra tu CSV aquí/)).toBeInTheDocument();
    expect(within(modal).getByText(/Descargar plantilla CSV/)).toBeInTheDocument();
  });

  it('uploads the selected CSV and transitions to the preview stage', async () => {
    renderSurface();
    await waitFor(() => screen.getByRole('button', { name: /Importar CSV/ }));
    fireEvent.click(screen.getByRole('button', { name: /Importar CSV/ }));

    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        envelope({
          totalRows: 2,
          new: [{ name: 'Entrantes', color: '#FFB347' }],
          duplicates: [
            { name: 'Postres', existingId: 'cat-postres' },
          ],
          errors: [],
        }),
      ),
    );

    const fileInput = screen.getByLabelText(/Subir archivo/) as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [makeCsvFile()] } });

    fireEvent.click(screen.getByRole('button', { name: /Previsualizar/ }));

    await waitFor(() => screen.getByTestId('cat-import-summary'));
    const summary = screen.getByTestId('cat-import-summary');
    expect(summary).toHaveTextContent('1');
    expect(summary).toHaveTextContent('1');
    expect(summary).toHaveTextContent('categorías nuevas');
    expect(summary).toHaveTextContent('duplicadas');

    const previewCall = fetchMock.mock.calls.find(([url, init]) =>
      String(url).includes('/api/categories/import/preview') &&
      (init as RequestInit | undefined)?.method === 'POST',
    );
    expect(previewCall).toBeDefined();
    expect((previewCall![1] as RequestInit).body).toBeInstanceOf(FormData);
  });

  it('commits the preview and shows a success status when complete', async () => {
    renderSurface();
    await waitFor(() => screen.getByRole('button', { name: /Importar CSV/ }));
    fireEvent.click(screen.getByRole('button', { name: /Importar CSV/ }));

    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(
          envelope({
            totalRows: 1,
            new: [{ name: 'Entrantes', color: '#FFB347' }],
            duplicates: [],
            errors: [],
          }),
        ),
      )
      .mockResolvedValueOnce(jsonResponse(envelope({ created: 1, updated: 0, skipped: 0 })))
      .mockResolvedValueOnce(jsonResponse([])); // categories refetch after invalidate

    const fileInput = screen.getByLabelText(/Subir archivo/) as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [makeCsvFile()] } });
    fireEvent.click(screen.getByRole('button', { name: /Previsualizar/ }));

    await waitFor(() => screen.getByRole('button', { name: /Importar 1 categorías/ }));
    fireEvent.click(screen.getByRole('button', { name: /Importar 1 categorías/ }));

    await waitFor(() => screen.getByTestId('cat-import-toast'));
    expect(screen.getByTestId('cat-import-toast')).toHaveTextContent(
      /Importación completada: 1 creadas, 0 actualizadas, 0 saltadas/,
    );

    const commitCall = fetchMock.mock.calls.find(([url, init]) =>
      String(url).includes('/api/categories/import/commit') &&
      (init as RequestInit | undefined)?.method === 'POST',
    );
    expect(commitCall).toBeDefined();
    const body = JSON.parse(((commitCall![1] as RequestInit).body ?? '{}') as string);
    expect(body.new).toHaveLength(1);
    expect(body.mode).toBe('skip-duplicates');
  });

  it('shows the dedupe radio + posts the chosen mode when duplicates exist', async () => {
    renderSurface();
    await waitFor(() => screen.getByRole('button', { name: /Importar CSV/ }));
    fireEvent.click(screen.getByRole('button', { name: /Importar CSV/ }));

    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(
          envelope({
            totalRows: 1,
            new: [],
            duplicates: [{ name: 'Postres', existingId: 'cat-postres', parentName: 'Carta' }],
            errors: [],
          }),
        ),
      )
      .mockResolvedValueOnce(jsonResponse(envelope({ created: 0, updated: 1, skipped: 0 })))
      .mockResolvedValueOnce(jsonResponse([]));

    const fileInput = screen.getByLabelText(/Subir archivo/) as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [makeCsvFile()] } });
    fireEvent.click(screen.getByRole('button', { name: /Previsualizar/ }));

    await waitFor(() => screen.getByText(/Actualizar duplicadas/));
    fireEvent.click(screen.getByLabelText(/Actualizar duplicadas/));

    fireEvent.click(screen.getByRole('button', { name: /Importar 0 categorías/ }));

    await waitFor(() => screen.getByTestId('cat-import-toast'));
    const commitCall = fetchMock.mock.calls.find(([url, init]) =>
      String(url).includes('/api/categories/import/commit') &&
      (init as RequestInit | undefined)?.method === 'POST',
    );
    const body = JSON.parse(((commitCall![1] as RequestInit).body ?? '{}') as string);
    expect(body.mode).toBe('update-duplicates');
    expect(body.duplicates).toHaveLength(1);
  });

  it('surfaces preview errors per-row and lets the operator retry', async () => {
    renderSurface();
    await waitFor(() => screen.getByRole('button', { name: /Importar CSV/ }));
    fireEvent.click(screen.getByRole('button', { name: /Importar CSV/ }));

    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        envelope({
          totalRows: 2,
          new: [],
          duplicates: [],
          errors: [
            { row: 1, message: 'nombre is required' },
            { row: 2, message: 'color must match #RRGGBB hex format (got "blue")' },
          ],
        }),
      ),
    );

    const fileInput = screen.getByLabelText(/Subir archivo/) as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [makeCsvFile()] } });
    fireEvent.click(screen.getByRole('button', { name: /Previsualizar/ }));

    await waitFor(() => screen.getByTestId('cat-import-summary'));
    expect(screen.getByTestId('cat-import-summary')).toHaveTextContent(/2.*errores/);
    // Expand the errors section
    fireEvent.click(screen.getByText(/Errores \(2\)/));
    await waitFor(() => screen.getByText(/fila 1: nombre is required/));
    expect(screen.getByText(/fila 2: color must match/)).toBeInTheDocument();
  });

  it('surfaces a server error on preview without leaving the pick stage', async () => {
    renderSurface();
    await waitFor(() => screen.getByRole('button', { name: /Importar CSV/ }));
    fireEvent.click(screen.getByRole('button', { name: /Importar CSV/ }));

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 'CATEGORIES_CSV_IMPORT_INVALID_FORMAT' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const fileInput = screen.getByLabelText(/Subir archivo/) as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [makeCsvFile()] } });
    fireEvent.click(screen.getByRole('button', { name: /Previsualizar/ }));

    await waitFor(() => {
      expect(screen.getByText(/No se pudo procesar el CSV/)).toBeInTheDocument();
    });
    // Still on the pick stage (the preview button is still there).
    expect(screen.getByRole('button', { name: /Previsualizar/ })).toBeInTheDocument();
  });

  it('exposes the CSV template as a downloadable data: URL with the documented columns', async () => {
    renderSurface();
    await waitFor(() => screen.getByRole('button', { name: /Importar CSV/ }));
    fireEvent.click(screen.getByRole('button', { name: /Importar CSV/ }));

    const link = await screen.findByRole('link', { name: /Descargar plantilla CSV/ });
    const href = link.getAttribute('href') ?? '';
    expect(href.startsWith('data:text/csv')).toBe(true);
    const decoded = decodeURIComponent(href.split(',').slice(1).join(','));
    expect(decoded).toContain('nombre,padre,color');
    expect(decoded).toContain('Entrantes');
  });
});
