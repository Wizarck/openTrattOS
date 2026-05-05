import type { Meta, StoryObj } from '@storybook/react';
import { SourceOverridePicker } from './SourceOverridePicker';
import type { SupplierItemOption } from './SourceOverridePicker.types';

const SINGLE: SupplierItemOption[] = [
  { id: 's1', supplierName: 'Makro', price: 4.5, currency: 'EUR', isPreferred: true, packLabel: '1 kg' },
];

const MULTI_WITH_PREFERRED: SupplierItemOption[] = [
  { id: 's1', supplierName: 'Makro', price: 4.5, currency: 'EUR', isPreferred: true, packLabel: '1 kg' },
  { id: 's2', supplierName: 'Aldi', price: 5.2, currency: 'EUR', isPreferred: false, packLabel: '1 kg' },
  { id: 's3', supplierName: 'Carrefour', price: 4.8, currency: 'EUR', isPreferred: false, packLabel: '1 kg' },
];

const MULTI_NO_PREFERRED: SupplierItemOption[] = [
  { id: 's2', supplierName: 'Aldi', price: 5.2, currency: 'EUR', isPreferred: false, packLabel: '1 kg' },
  { id: 's3', supplierName: 'Carrefour', price: 4.8, currency: 'EUR', isPreferred: false, packLabel: '1 kg' },
  { id: 's4', supplierName: 'Mercadona', price: 4.95, currency: 'EUR', isPreferred: false, packLabel: '1 kg' },
];

const meta: Meta<typeof SourceOverridePicker> = {
  title: 'Suppliers/SourceOverridePicker',
  component: SourceOverridePicker,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          '"Edit source" picker. Radio-list ordered preferred-first then by price ascending. "Use preferred" clears the override (per Gate D decision 1a — back to the PreferredSupplierResolver default).',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const SingleOption: Story = {
  args: {
    options: SINGLE,
    currentOverrideId: null,
    onApply: () => undefined,
    onClear: () => undefined,
  },
};

export const MultipleWithPreferred: Story = {
  args: {
    options: MULTI_WITH_PREFERRED,
    currentOverrideId: null,
    onApply: () => undefined,
    onClear: () => undefined,
  },
  parameters: {
    docs: {
      description: {
        story: 'Preferred renders first with a visible "Preferred" badge. Carrefour (4.80€) sits above Aldi (5.20€) per price tiebreaker.',
      },
    },
  },
};

export const MultipleNoPreferred: Story = {
  args: {
    options: MULTI_NO_PREFERRED,
    currentOverrideId: null,
    onApply: () => undefined,
    onClear: () => undefined,
  },
  parameters: {
    docs: {
      description: {
        story: 'No preferred set: ordering falls back to price ascending. Carrefour (4.80€) → Mercadona (4.95€) → Aldi (5.20€).',
      },
    },
  },
};

export const WithCurrentOverride: Story = {
  args: {
    options: MULTI_WITH_PREFERRED,
    currentOverrideId: 's2',
    onApply: () => undefined,
    onClear: () => undefined,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Recipe line already has an override pinned to Aldi. The "Use preferred" button is enabled; clicking it would clear the override and revert to Makro (the resolver-preferred).',
      },
    },
  },
};

export const NoOptions: Story = {
  args: {
    options: [],
    currentOverrideId: null,
    onApply: () => undefined,
    onClear: () => undefined,
    emptyStateCopy: 'No suppliers available for this ingredient. Add SupplierItems first.',
  },
};
