import type { Meta, StoryObj } from '@storybook/react';
import { MarginPanel } from './MarginPanel';
import type { MarginReport } from './MarginPanel.types';

const baseReport: MarginReport = {
  menuItemId: '11111111-1111-4111-8111-111111111111',
  organizationId: '22222222-2222-4222-8222-222222222222',
  recipeId: '33333333-3333-4333-8333-333333333333',
  locationId: '44444444-4444-4444-8444-444444444444',
  channel: 'DINE_IN',
  cost: 3.0,
  sellingPrice: 12.0,
  targetMargin: 0.6,
  marginAbsolute: 9.0,
  marginPercent: 0.75,
  marginVsTargetPp: 0.15,
  status: 'on_target',
  statusLabel: 'On target',
  warnings: [],
  recipeDiscontinued: false,
  currency: 'EUR',
};

const meta: Meta<typeof MarginPanel> = {
  title: 'Cost/MarginPanel',
  component: MarginPanel,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Read-time margin panel for a MenuItem. Status colour ALWAYS paired with `statusLabel` text per ADR-016. Currency formatting via `Intl.NumberFormat` with `style: "currency"`. Loading state renders a skeleton; unknown state surfaces warnings.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const OnTarget: Story = {
  args: { report: baseReport },
};

export const BelowTarget: Story = {
  args: {
    report: {
      ...baseReport,
      cost: 5.2,
      marginAbsolute: 6.8,
      marginPercent: 0.567,
      marginVsTargetPp: -0.033,
      status: 'below_target',
      statusLabel: 'Below target',
    },
  },
};

export const AtRisk: Story = {
  args: {
    report: {
      ...baseReport,
      cost: 7.0,
      marginAbsolute: 5.0,
      marginPercent: 0.417,
      marginVsTargetPp: -0.183,
      status: 'at_risk',
      statusLabel: 'At risk',
    },
  },
};

export const Unknown: Story = {
  args: {
    report: {
      ...baseReport,
      cost: null,
      marginAbsolute: null,
      marginPercent: null,
      marginVsTargetPp: null,
      status: 'unknown',
      statusLabel: 'Cost unknown',
      warnings: [
        'cost_unresolved: at least one ingredient has no preferred SupplierItem; margin shown as unknown',
      ],
    },
  },
};

export const Loading: Story = {
  args: { report: null, loading: true },
};

export const DiscontinuedRecipe: Story = {
  args: {
    report: {
      ...baseReport,
      status: 'on_target',
      statusLabel: 'On target',
      recipeDiscontinued: true,
    },
  },
  parameters: {
    docs: {
      description: {
        story:
          'When the parent Recipe is soft-deleted, the panel surfaces the `(Recipe discontinued)` hint alongside the status badge.',
      },
    },
  },
};
