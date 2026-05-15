import type { Meta, StoryObj } from '@storybook/react';
import { TransparencyBanner } from './TransparencyBanner';

const meta: Meta<typeof TransparencyBanner> = {
  title: 'APPCC/TransparencyBanner',
  component: TransparencyBanner,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'j9 region #1 — load-bearing FR25 trust-principle banner. Text is verbatim; cannot be overridden.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: {} };
