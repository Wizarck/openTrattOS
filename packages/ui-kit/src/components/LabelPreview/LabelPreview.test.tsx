import { fireEvent, render, screen } from '@testing-library/react';
import { LabelPreview } from './LabelPreview';
import { LabelMissingFieldsError } from './LabelPreview.types';

describe('LabelPreview', () => {
  const baseProps = {
    recipeId: 'r-1',
    locale: 'es' as const,
    onLocaleChange: vi.fn(),
    previewUrl: '/api/recipes/r-1/label?locale=es&organizationId=o-1',
    onPrint: vi.fn(),
    onDownload: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the preview iframe pointed at the streaming endpoint', () => {
    render(<LabelPreview {...baseProps} />);
    const iframe = screen.getByTestId('label-preview-iframe');
    expect(iframe).toHaveAttribute('src', baseProps.previewUrl);
  });

  it('triggers onPrint when Print button is clicked', () => {
    render(<LabelPreview {...baseProps} />);
    fireEvent.click(screen.getByTestId('label-print-button'));
    expect(baseProps.onPrint).toHaveBeenCalledTimes(1);
  });

  it('triggers onDownload when Download button is clicked', () => {
    render(<LabelPreview {...baseProps} />);
    fireEvent.click(screen.getByTestId('label-download-button'));
    expect(baseProps.onDownload).toHaveBeenCalledTimes(1);
  });

  it('triggers onLocaleChange when the locale select changes', () => {
    render(<LabelPreview {...baseProps} />);
    fireEvent.change(screen.getByTestId('label-locale-select'), { target: { value: 'en' } });
    expect(baseProps.onLocaleChange).toHaveBeenCalledWith('en');
  });

  it('lists missing Article 9 fields when the renderer refuses', () => {
    const error: LabelMissingFieldsError = {
      code: 'MISSING_MANDATORY_FIELDS',
      missing: ['org.businessName', 'org.postalAddress.city'],
    };
    render(<LabelPreview {...baseProps} error={error} />);
    const block = screen.getByTestId('label-error-missing-fields');
    expect(block).toHaveTextContent('org.businessName');
    expect(block).toHaveTextContent('org.postalAddress.city');
    expect(screen.queryByTestId('label-preview-iframe')).toBeNull();
  });

  it('shows unsupported-locale error with supported list', () => {
    render(
      <LabelPreview
        {...baseProps}
        error={{ code: 'UNSUPPORTED_LOCALE', locale: 'zz', supported: ['es', 'en', 'it'] }}
      />,
    );
    expect(screen.getByTestId('label-error-locale')).toHaveTextContent('es, en, it');
  });

  it('shows print-adapter-not-configured error', () => {
    render(
      <LabelPreview {...baseProps} error={{ code: 'PRINT_ADAPTER_NOT_CONFIGURED' }} />,
    );
    expect(screen.getByTestId('label-error-adapter')).toBeInTheDocument();
  });

  it('shows generic error message when code is unknown', () => {
    render(<LabelPreview {...baseProps} error={{ code: 'INTERNAL_ERROR' }} />);
    expect(screen.getByTestId('label-error-generic')).toHaveTextContent('INTERNAL_ERROR');
  });

  it('disables Print + Download while loading', () => {
    render(<LabelPreview {...baseProps} loading />);
    expect(screen.getByTestId('label-print-button')).toBeDisabled();
    expect(screen.getByTestId('label-download-button')).toBeDisabled();
  });

  it('shows "Printing…" label and disables Print while in-flight', () => {
    render(<LabelPreview {...baseProps} printing />);
    expect(screen.getByTestId('label-print-button')).toHaveTextContent('Printing…');
    expect(screen.getByTestId('label-print-button')).toBeDisabled();
  });

  it('shows print success status when jobId is present', () => {
    render(<LabelPreview {...baseProps} printSuccessJobId="job-42" />);
    expect(screen.getByTestId('label-print-success')).toHaveTextContent('job-42');
  });

  it('does NOT show iframe when an error is present', () => {
    render(
      <LabelPreview
        {...baseProps}
        error={{ code: 'MISSING_MANDATORY_FIELDS', missing: ['org.businessName'] }}
      />,
    );
    expect(screen.queryByTestId('label-preview-iframe')).toBeNull();
  });

  it('region role + aria-label for screen readers', () => {
    render(<LabelPreview {...baseProps} />);
    expect(screen.getByRole('region', { name: /label preview/i })).toBeInTheDocument();
  });

  it('locale select disables when loading', () => {
    render(<LabelPreview {...baseProps} loading />);
    expect(screen.getByTestId('label-locale-select')).toBeDisabled();
  });

  it('exposes recipeId via data attribute for E2E selectors', () => {
    render(<LabelPreview {...baseProps} recipeId="recipe-xyz" />);
    expect(screen.getByTestId('label-preview')).toHaveAttribute(
      'data-recipe-id',
      'recipe-xyz',
    );
  });
});
