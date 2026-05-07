import type { Meta, StoryObj } from '@storybook/react';
import { AuditLogRowDetail } from './AuditLogRowDetail';

const meta: Meta<typeof AuditLogRowDetail> = {
  title: 'Compliance/AuditLogRowDetail',
  component: AuditLogRowDetail,
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const WithPayloads: Story = {
  args: {
    payloadBefore: {
      name: 'Bolognesa',
      portions: 4,
      ingredients: [
        { id: 'ing-1', quantity: 500, unit: 'g' },
        { id: 'ing-2', quantity: 250, unit: 'ml' },
      ],
    },
    payloadAfter: {
      name: 'Bolognesa renamed',
      portions: 6,
      ingredients: [
        { id: 'ing-1', quantity: 750, unit: 'g' },
        { id: 'ing-2', quantity: 375, unit: 'ml' },
      ],
    },
    reason: 'recipes.update',
    citationUrl: null,
    snippet: null,
  },
};

export const EmptyPayloads: Story = {
  args: {
    payloadBefore: null,
    payloadAfter: null,
    reason: 'Manual entry — no AI suggestion available',
    citationUrl: null,
    snippet: null,
  },
};

export const WithCitation: Story = {
  args: {
    payloadBefore: null,
    payloadAfter: { value: 0.65 },
    reason: 'AI yield suggestion accepted',
    citationUrl: 'https://fdc.nal.usda.gov/product/12345',
    snippet: 'USDA FoodData Central · Beef chuck · 65% yield',
  },
};
