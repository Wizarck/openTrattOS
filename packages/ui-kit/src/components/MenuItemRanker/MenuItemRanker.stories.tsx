import type { Meta, StoryObj } from '@storybook/react';
import { MenuItemRanker } from './MenuItemRanker';
import type { DashboardMenuItem } from './MenuItemRanker.types';
import type { MarginReport } from '../MarginPanel';

function makeItem(
  id: string,
  name: string,
  marginPercent: number | null,
  status: MarginReport['status'],
): DashboardMenuItem {
  return {
    menuItemId: id,
    recipeId: `r-${id}`,
    locationId: 'loc-1',
    channel: 'DINE_IN',
    displayLabel: name,
    margin: {
      menuItemId: id,
      organizationId: 'org-1',
      recipeId: `r-${id}`,
      locationId: 'loc-1',
      channel: 'DINE_IN',
      cost: marginPercent === null ? null : 4,
      sellingPrice: 14,
      targetMargin: 0.6,
      marginAbsolute: marginPercent === null ? null : 14 - 4,
      marginPercent,
      marginVsTargetPp: marginPercent === null ? null : marginPercent - 0.6,
      status,
      statusLabel:
        status === 'on_target'
          ? 'On target'
          : status === 'below_target'
            ? 'Below target'
            : status === 'at_risk'
              ? 'At risk'
              : 'Cost unknown',
      warnings: status === 'unknown' ? ['cost_unresolved: missing supplier'] : [],
      recipeDiscontinued: false,
      currency: 'EUR',
    },
  };
}

const TOP: DashboardMenuItem[] = [
  makeItem('m1', 'Tagliatelle ragù', 0.72, 'on_target'),
  makeItem('m2', 'Pizza margherita', 0.68, 'on_target'),
  makeItem('m3', 'Tiramisú', 0.66, 'on_target'),
  makeItem('m4', 'Risotto pere', 0.62, 'on_target'),
  makeItem('m5', 'Ensalada César', 0.61, 'on_target'),
];

const BOTTOM: DashboardMenuItem[] = [
  makeItem('m9', 'Carpaccio', 0.32, 'at_risk'),
  makeItem('m10', 'Lasagna especial', 0.41, 'at_risk'),
  makeItem('m11', 'Tarta de queso', 0.55, 'below_target'),
  makeItem('m12', 'Focaccia romana', 0.57, 'below_target'),
  makeItem('m13', 'Spaghetti pomodoro', 0.58, 'below_target'),
];

const meta: Meta<typeof MenuItemRanker> = {
  title: 'Dashboard/MenuItemRanker',
  component: MenuItemRanker,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Owner Sunday-night dashboard ranker. Stacked on mobile, two-column on tablet+. Cards expand inline on tap to reveal the full MarginPanel + drill-down link.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { top: TOP, bottom: BOTTOM, onViewDetails: () => undefined },
};

export const TopOnly: Story = {
  args: { top: TOP, bottom: [] },
};

export const BottomOnly: Story = {
  args: { top: [], bottom: BOTTOM },
};

export const Mobile: Story = {
  args: { top: TOP, bottom: BOTTOM },
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
};

export const Tablet: Story = {
  args: { top: TOP, bottom: BOTTOM },
  parameters: {
    viewport: { defaultViewport: 'tablet' },
  },
};

export const Empty: Story = {
  args: { top: [], bottom: [], emptyStateCopy: 'Add MenuItems to see ranking.' },
};

export const Loading: Story = {
  args: { top: [], bottom: [], loading: true },
};

export const WithUnknownStatus: Story = {
  args: {
    top: TOP.slice(0, 3),
    bottom: [
      makeItem('mu', 'Sopa misteriosa', null, 'unknown'),
      ...BOTTOM.slice(0, 3),
    ],
  },
  parameters: {
    docs: {
      description: {
        story: 'When a MenuItem cost is unresolvable, the row shows "Cost unknown" and the status badge uses the muted token. Always paired with text per ADR-016.',
      },
    },
  },
};
