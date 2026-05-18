import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { BrandMarkPicker } from './BrandMarkPicker';

function makeFile(name: string, type: string, size: number): File {
  const f = new File(['x'.repeat(size)], name, { type });
  // jsdom uses string length as size — confirm and adjust if needed.
  Object.defineProperty(f, 'size', { value: size, configurable: true });
  return f;
}

describe('BrandMarkPicker', () => {
  it('renders the placeholder + drag-and-drop copy when no logo set', () => {
    render(
      <BrandMarkPicker
        onFilePicked={vi.fn()}
        onUrlChanged={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByText(/Arrastra una imagen aquí/)).toBeInTheDocument();
    expect(screen.getByText(/PNG, JPG, WEBP, SVG/)).toBeInTheDocument();
    expect(screen.queryByText('Quitar')).not.toBeInTheDocument();
  });

  it('renders preview img + Quitar button when value is set', () => {
    render(
      <BrandMarkPicker
        value="https://example.com/logo.png"
        onFilePicked={vi.fn()}
        onUrlChanged={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByAltText('Logotipo actual')).toHaveAttribute(
      'src',
      'https://example.com/logo.png',
    );
    expect(screen.getByText('Quitar')).toBeInTheDocument();
  });

  it('fires onFilePicked for a valid PNG drop', () => {
    const onFilePicked = vi.fn();
    render(<BrandMarkPicker onFilePicked={onFilePicked} onUrlChanged={vi.fn()} onClear={vi.fn()} />);
    const dropzone = screen.getByLabelText('Subir logotipo');
    const file = makeFile('logo.png', 'image/png', 1024);
    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });
    expect(onFilePicked).toHaveBeenCalledWith(file);
  });

  it('rejects oversize files client-side without calling onFilePicked', () => {
    const onFilePicked = vi.fn();
    render(<BrandMarkPicker onFilePicked={onFilePicked} onUrlChanged={vi.fn()} onClear={vi.fn()} />);
    const huge = makeFile('huge.png', 'image/png', 3 * 1024 * 1024);
    fireEvent.drop(screen.getByLabelText('Subir logotipo'), { dataTransfer: { files: [huge] } });
    expect(onFilePicked).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/Archivo demasiado grande/);
  });

  it('rejects disallowed MIME without calling onFilePicked', () => {
    const onFilePicked = vi.fn();
    render(<BrandMarkPicker onFilePicked={onFilePicked} onUrlChanged={vi.fn()} onClear={vi.fn()} />);
    const gif = makeFile('animated.gif', 'image/gif', 1024);
    fireEvent.drop(screen.getByLabelText('Subir logotipo'), { dataTransfer: { files: [gif] } });
    expect(onFilePicked).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/Formato no permitido/);
  });

  it('shows uploading state + spinner copy when uploading prop is true', () => {
    render(
      <BrandMarkPicker
        onFilePicked={vi.fn()}
        onUrlChanged={vi.fn()}
        onClear={vi.fn()}
        uploading
      />,
    );
    expect(screen.getByText('Subiendo logotipo…')).toBeInTheDocument();
  });

  it('surfaces server error message via the error prop', () => {
    render(
      <BrandMarkPicker
        onFilePicked={vi.fn()}
        onUrlChanged={vi.fn()}
        onClear={vi.fn()}
        error="Formato no permitido (image/gif)."
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/Formato no permitido/);
  });

  it('fires onUrlChanged when the URL fallback input is edited', () => {
    const onUrlChanged = vi.fn();
    render(<BrandMarkPicker onFilePicked={vi.fn()} onUrlChanged={onUrlChanged} onClear={vi.fn()} />);
    const input = screen.getByLabelText(/pega una URL externa/);
    fireEvent.change(input, { target: { value: 'https://cdn.example.com/logo.svg' } });
    expect(onUrlChanged).toHaveBeenLastCalledWith('https://cdn.example.com/logo.svg');
  });

  it('passes undefined to onUrlChanged when the URL field is cleared', () => {
    const onUrlChanged = vi.fn();
    render(
      <BrandMarkPicker
        value="https://x"
        onFilePicked={vi.fn()}
        onUrlChanged={onUrlChanged}
        onClear={vi.fn()}
      />,
    );
    const input = screen.getByLabelText(/pega una URL externa/);
    fireEvent.change(input, { target: { value: '' } });
    expect(onUrlChanged).toHaveBeenLastCalledWith(undefined);
  });

  it('clicking Quitar fires onClear', () => {
    const onClear = vi.fn();
    render(
      <BrandMarkPicker
        value="https://x"
        onFilePicked={vi.fn()}
        onUrlChanged={vi.fn()}
        onClear={onClear}
      />,
    );
    fireEvent.click(screen.getByText('Quitar'));
    expect(onClear).toHaveBeenCalled();
  });
});
