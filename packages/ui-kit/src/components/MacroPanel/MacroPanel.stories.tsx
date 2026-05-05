import type { Meta, StoryObj } from '@storybook/react';
import { MacroPanel } from './MacroPanel';
import type { MacroRollup } from './MacroPanel.types';

const TYPICAL_ROLLUP: MacroRollup = {
  perPortion: {
    'energy-kcal': 425,
    proteins: 18.4,
    carbohydrates: 52.1,
    sugars: 6.2,
    fat: 12.8,
    'saturated-fat': 4.1,
    fiber: 3.5,
    salt: 1.2,
  },
  per100g: {
    'energy-kcal': 158,
    proteins: 6.8,
    carbohydrates: 19.3,
    sugars: 2.3,
    fat: 4.7,
    'saturated-fat': 1.5,
    fiber: 1.3,
    salt: 0.4,
  },
  totalWeightG: 270,
  externalSources: [
    { ingredientId: 'i-1', externalSourceRef: '8005110001234' },
    { ingredientId: 'i-2', externalSourceRef: '3033490004477' },
  ],
};

const NO_OFF: MacroRollup = {
  ...TYPICAL_ROLLUP,
  externalSources: [],
};

const EMPTY: MacroRollup = {
  perPortion: {},
  per100g: {},
  totalWeightG: null,
  externalSources: [],
};

const meta: Meta<typeof MacroPanel> = {
  title: 'Ingredients/MacroPanel',
  component: MacroPanel,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Recipe macro panel. Compact (default) shows per-portion only; expanded adds per-100g column. ODbL attribution always visible when any ingredient has externalSourceRef populated (Gate D decision 3a).',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Compact: Story = {
  args: { rollup: TYPICAL_ROLLUP, mode: 'compact' },
};

export const Expanded: Story = {
  args: { rollup: TYPICAL_ROLLUP, mode: 'expanded' },
  parameters: {
    docs: {
      description: {
        story: 'Expanded view: per-portion + per-100g side-by-side, plus total weight.',
      },
    },
  },
};

export const NoOFFSources: Story = {
  args: { rollup: NO_OFF, mode: 'compact' },
  parameters: {
    docs: {
      description: {
        story: 'Locally-authored ingredients only; no ODbL attribution required.',
      },
    },
  },
};

export const Empty: Story = {
  args: { rollup: EMPTY },
};

export const Loading: Story = {
  args: { rollup: null, loading: true },
};

export const SpanishLocale: Story = {
  args: { rollup: TYPICAL_ROLLUP, mode: 'expanded', locale: 'es-ES' },
};
