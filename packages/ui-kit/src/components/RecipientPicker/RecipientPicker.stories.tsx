import type { Meta, StoryObj } from '@storybook/react';
import { RecipientPicker } from './RecipientPicker';

const CONTACTS = [
  { id: 'r-1', label: 'Marta Egaña', email: 'marta@inspeccion.gob' },
  { id: 'r-2', label: 'Seguros del Sur', email: 'siniestros@seguros.es' },
];

const meta: Meta<typeof RecipientPicker> = {
  title: 'APPCC/RecipientPicker',
  component: RecipientPicker,
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Collapsed: Story = {
  args: {
    expanded: false,
    onToggleExpanded: () => {},
    contacts: CONTACTS,
    selectedAddresses: [],
    onChangeSelected: () => {},
  },
};

export const ExpandedWithContacts: Story = {
  args: {
    expanded: true,
    onToggleExpanded: () => {},
    contacts: CONTACTS,
    selectedAddresses: ['marta@inspeccion.gob'],
    onChangeSelected: () => {},
  },
};
