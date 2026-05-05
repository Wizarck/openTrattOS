import type { Meta, StoryObj } from '@storybook/react';
import { CostDeltaTable } from './CostDeltaTable';
import type { CostDeltaRow } from './CostDeltaTable.types';

const MIXED: CostDeltaRow[] = [
  {
    componentId: 'c1',
    componentName: 'Tomate Mutti',
    oldCost: 3.4,
    newCost: 4.1,
    deltaAbsolute: 0.7,
    deltaPercent: 0.2059,
    direction: 'increase',
    currency: 'EUR',
  },
  {
    componentId: 'c2',
    componentName: 'Aceite oliva V.E.',
    oldCost: 8.9,
    newCost: 7.95,
    deltaAbsolute: -0.95,
    deltaPercent: -0.1067,
    direction: 'decrease',
    currency: 'EUR',
  },
  {
    componentId: 'c3',
    componentName: 'Sal marina',
    oldCost: 0.4,
    newCost: 0.4,
    deltaAbsolute: 0,
    deltaPercent: 0,
    direction: 'unchanged',
    currency: 'EUR',
  },
];

const ALL_INCREASES: CostDeltaRow[] = MIXED.filter((r) => r.direction === 'increase');
const ALL_DECREASES: CostDeltaRow[] = MIXED.filter((r) => r.direction === 'decrease');

const meta: Meta<typeof CostDeltaTable> = {
  title: 'Cost/CostDeltaTable',
  component: CostDeltaTable,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          '"What changed?" per-component delta table for J2 (Lourdes investigates a cost spike). Colour-coded by direction (at-risk / on-target / muted) AND with arrow icons for deuteranopia safety. Sorted by absolute delta magnitude descending.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { rows: MIXED },
};

export const OnlyIncreases: Story = {
  args: { rows: ALL_INCREASES },
};

export const OnlyDecreases: Story = {
  args: { rows: ALL_DECREASES },
};

export const NoChanges: Story = {
  args: { rows: MIXED.filter((r) => r.direction === 'unchanged') },
};

export const Empty: Story = {
  args: { rows: [], emptyStateCopy: 'No cost changes in the last 14 days' },
};

export const Loading: Story = {
  args: { rows: [], loading: true },
};

export const WithCaption: Story = {
  args: {
    rows: MIXED,
    caption: 'Cost changes between 2026-04-21 and 2026-05-05 (14 days)',
  },
};
