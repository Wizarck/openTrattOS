import type { Meta, StoryObj } from '@storybook/react';
import { LocaleChipGroup } from './LocaleChipGroup';

const meta: Meta<typeof LocaleChipGroup> = {
  title: 'APPCC/LocaleChipGroup',
  component: LocaleChipGroup,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'j9 region #3 — locale picker. Four chips, single-select, visual permanence per ADR-J9-LOCALE-CHIPS-NOT-DROPDOWN.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Castellano: Story = {
  args: { value: 'es-ES', onChange: () => {} },
};

export const Catala: Story = {
  args: { value: 'ca-ES', onChange: () => {} },
};

export const Euskara: Story = {
  args: { value: 'eu-ES', onChange: () => {} },
};

export const Galego: Story = {
  args: { value: 'gl-ES', onChange: () => {} },
};
