import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { RecipePicker } from './RecipePicker';
import type { RecipeListItem } from './RecipePicker.types';

const SAMPLE: RecipeListItem[] = [
  { id: 'r1', name: 'tagliatelle bolognesa ragù', displayLabel: 'Tagliatelle bolognesa ragù', isActive: true },
  { id: 'r2', name: 'salsa pomodoro base', displayLabel: 'Salsa pomodoro (base)', isActive: true },
  { id: 'r3', name: 'pesto genovés', displayLabel: 'Pesto genovés', isActive: true },
  { id: 'r4', name: 'tarta de manzana antigua', displayLabel: 'Tarta de manzana (antigua)', isActive: false },
];

const meta: Meta<typeof RecipePicker> = {
  title: 'Recipes/RecipePicker',
  component: RecipePicker,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Typeahead recipe selector. Combobox role, 250 ms debounce, keyboard nav. The caller fetches results — the component is purely presentational + interaction.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    recipes: [],
    onSearch: () => undefined,
    onSelect: () => undefined,
  },
};

export const WithResults: Story = {
  args: {
    recipes: SAMPLE,
    onSearch: () => undefined,
    onSelect: () => undefined,
  },
};

export const Loading: Story = {
  args: {
    recipes: [],
    loading: true,
    onSearch: () => undefined,
    onSelect: () => undefined,
  },
};

export const Empty: Story = {
  args: {
    recipes: [],
    emptyStateCopy: 'No recipes match "xyz123"',
    onSearch: () => undefined,
    onSelect: () => undefined,
  },
};

export const KeyboardFocus: Story = {
  args: {
    recipes: SAMPLE,
    onSearch: () => undefined,
    onSelect: () => undefined,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Open Storybook canvas, click into the input, then press ArrowDown to highlight + Enter to select. Verifies aria-activedescendant changes per row.',
      },
    },
  },
};

export const ActiveOnly: Story = {
  args: {
    recipes: SAMPLE,
    activeOnly: true,
    onSearch: () => undefined,
    onSelect: () => undefined,
  },
  parameters: {
    docs: {
      description: {
        story: 'When `activeOnly` is true, soft-deleted recipes are filtered out client-side. Useful for building flows where discontinued recipes should never be picked.',
      },
    },
  },
};

export const Interactive: Story = {
  render: () => {
    function InteractiveDemo() {
      const [picked, setPicked] = useState<RecipeListItem | null>(null);
      return (
        <div className="space-y-3">
          <RecipePicker recipes={SAMPLE} onSearch={() => undefined} onSelect={setPicked} />
          {picked && <p className="text-sm text-ink">Picked: <strong>{picked.displayLabel}</strong></p>}
        </div>
      );
    }
    return <InteractiveDemo />;
  },
};
