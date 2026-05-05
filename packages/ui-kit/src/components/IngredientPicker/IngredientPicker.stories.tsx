import type { Meta, StoryObj } from '@storybook/react';
import { IngredientPicker } from './IngredientPicker';
import type { IngredientListItem } from './IngredientPicker.types';

const LOCAL_ONLY: IngredientListItem[] = [
  { id: 'i1', name: 'tomate', brandName: null, barcode: null, displayLabel: 'Tomate', isActive: true },
  { id: 'i2', name: 'cebolla', brandName: null, barcode: null, displayLabel: 'Cebolla', isActive: true },
  { id: 'i3', name: 'aceite oliva virgen extra', brandName: null, barcode: null, displayLabel: 'Aceite oliva V.E.', isActive: true },
];

const OFF_ENRICHED: IngredientListItem[] = [
  {
    id: 'i10',
    name: 'tomate triturado mutti',
    brandName: 'Mutti',
    barcode: '8005110001234',
    displayLabel: 'Tomate triturado',
    isActive: true,
  },
  {
    id: 'i11',
    name: 'aceite oliva carbonell',
    brandName: 'Carbonell',
    barcode: '8410090001000',
    displayLabel: 'Aceite oliva V.E. 750ml',
    isActive: true,
  },
  {
    id: 'i12',
    name: 'mantequilla president',
    brandName: 'Président',
    barcode: '3033490004477',
    displayLabel: 'Mantequilla con sal',
    isActive: true,
  },
];

const meta: Meta<typeof IngredientPicker> = {
  title: 'Ingredients/IngredientPicker',
  component: IngredientPicker,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Typeahead ingredient selector. Renders 3-line cards (name + brand + barcode) when OFF-mirror data is present; falls back to single-line when brand/barcode are null (pre-#5 state).',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { ingredients: [], onSearch: () => undefined, onSelect: () => undefined },
};

export const WithResultsLocalOnly: Story = {
  args: { ingredients: LOCAL_ONLY, onSearch: () => undefined, onSelect: () => undefined },
  parameters: {
    docs: {
      description: {
        story: 'Local-only mode (pre-#5). Brand and barcode lines are absent. Only the displayLabel renders.',
      },
    },
  },
};

export const WithResultsOFFEnriched: Story = {
  args: { ingredients: OFF_ENRICHED, onSearch: () => undefined, onSelect: () => undefined },
  parameters: {
    docs: {
      description: {
        story: 'OFF-enriched mode (post-#5). Each card renders 3 lines: ingredient name, brand, barcode. Barcode uses monospace font.',
      },
    },
  },
};

export const Loading: Story = {
  args: { ingredients: [], loading: true, onSearch: () => undefined, onSelect: () => undefined },
};

export const Empty: Story = {
  args: {
    ingredients: [],
    emptyStateCopy: 'Sin coincidencias',
    onSearch: () => undefined,
    onSelect: () => undefined,
  },
};
