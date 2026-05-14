import type { Meta, StoryObj } from '@storybook/react';
import { ScopeCheckboxList } from './ScopeCheckboxList';

const meta: Meta<typeof ScopeCheckboxList> = {
  title: 'APPCC/ScopeCheckboxList',
  component: ScopeCheckboxList,
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Defaults: Story = {
  args: {
    value: {
      haccp: true,
      lot: true,
      procurement: false,
      photo: false,
      ai_obs: false,
    },
    onChange: () => {},
  },
};

export const AllChecked: Story = {
  args: {
    value: {
      haccp: true,
      lot: true,
      procurement: true,
      photo: true,
      ai_obs: true,
    },
    onChange: () => {},
  },
};
