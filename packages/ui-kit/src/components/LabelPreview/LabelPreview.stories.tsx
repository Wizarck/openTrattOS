import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { LabelPreview } from './LabelPreview';
import type { LabelPreviewLocale } from './LabelPreview.types';

const meta: Meta<typeof LabelPreview> = {
  title: 'Labels/LabelPreview',
  component: LabelPreview,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'EU 1169/2011 label preview. Embeds the streaming PDF in an `<iframe>`, exposes Print + Download actions, and renders inline errors for refusal-on-incomplete + unsupported locale + missing print adapter. The 3-click print flow is owned by the parent — this component just emits the events.',
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof LabelPreview>;

const baseProps = {
  recipeId: 'r-1',
  previewUrl: 'about:blank',
  onPrint: () => undefined,
  onDownload: () => undefined,
};

function withLocaleState(initial: LabelPreviewLocale = 'es') {
  function Wrapped(args: { error?: Parameters<typeof LabelPreview>[0]['error'] } = {}) {
    const [locale, setLocale] = useState<LabelPreviewLocale>(initial);
    return (
      <LabelPreview
        {...baseProps}
        locale={locale}
        onLocaleChange={setLocale}
        error={args.error}
      />
    );
  }
  return Wrapped;
}

export const Default: Story = {
  render: () => {
    const Wrapped = withLocaleState();
    return <Wrapped />;
  },
};

export const Loading: Story = {
  render: () => (
    <LabelPreview
      {...baseProps}
      locale="es"
      onLocaleChange={() => undefined}
      loading
    />
  ),
};

export const PrintingInFlight: Story = {
  render: () => (
    <LabelPreview
      {...baseProps}
      locale="es"
      onLocaleChange={() => undefined}
      printing
    />
  ),
};

export const PrintSuccess: Story = {
  render: () => (
    <LabelPreview
      {...baseProps}
      locale="es"
      onLocaleChange={() => undefined}
      printSuccessJobId="job-42"
    />
  ),
};

export const MissingFieldsError: Story = {
  render: () => (
    <LabelPreview
      {...baseProps}
      locale="es"
      onLocaleChange={() => undefined}
      error={{
        code: 'MISSING_MANDATORY_FIELDS',
        missing: ['org.businessName', 'org.postalAddress.city', 'recipe.macros.kcal'],
      }}
    />
  ),
};

export const UnsupportedLocale: Story = {
  render: () => (
    <LabelPreview
      {...baseProps}
      locale="es"
      onLocaleChange={() => undefined}
      error={{ code: 'UNSUPPORTED_LOCALE', locale: 'zz', supported: ['es', 'en', 'it'] }}
    />
  ),
};

export const PrintAdapterNotConfigured: Story = {
  render: () => (
    <LabelPreview
      {...baseProps}
      locale="es"
      onLocaleChange={() => undefined}
      error={{ code: 'PRINT_ADAPTER_NOT_CONFIGURED' }}
    />
  ),
};
