import type { Meta, StoryObj } from '@storybook/react';
import { LabelFieldsForm } from './LabelFieldsForm';
import type { LabelFieldsFormValues } from './LabelFieldsForm.types';

const meta: Meta<typeof LabelFieldsForm> = {
  title: 'Compliance/LabelFieldsForm',
  component: LabelFieldsForm,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Owner-facing form for `organizations.label_fields` jsonb config (Wave 1.6 m2-labels-rendering). Six sections: business name, contact, address, brand mark, page size, printer adapter (IPP). Presentational; consumer owns the GET/PUT mutation. EU 1169/2011 Article 9 mandatory-field validation runs at render time, not at this form — so partial saves are fine.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

const filled: LabelFieldsFormValues = {
  businessName: 'Trattoria Acme',
  contactInfo: { email: 'info@acme.es', phone: '+34 600 000 000' },
  postalAddress: {
    street: 'Calle Mayor 1',
    city: 'Madrid',
    postalCode: '28001',
    country: 'España',
  },
  brandMarkUrl: 'https://placehold.co/120x40/png?text=ACME',
  pageSize: 'a4',
  printAdapter: {
    id: 'ipp',
    config: { url: 'ipp://printer.local:631/printers/labels', queue: 'labels', timeoutMs: 5000 },
  },
};

export const Empty: Story = {
  args: {
    onSubmit: () => {},
  },
};

export const Filled: Story = {
  args: {
    initialValues: filled,
    onSubmit: () => {},
  },
};

export const Submitting: Story = {
  args: {
    initialValues: filled,
    submitting: true,
    onSubmit: () => {},
  },
};

export const WithErrors: Story = {
  args: {
    initialValues: filled,
    errors: {
      brandMarkUrl: 'must be a URL',
      'postalAddress.city': 'required',
      'printAdapter.config.url': 'must be a URL',
    },
    onSubmit: () => {},
  },
};

export const Disabled: Story = {
  args: {
    initialValues: filled,
    disabled: true,
    onSubmit: () => {},
  },
};
