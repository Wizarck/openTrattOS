import type { Meta, StoryObj } from '@storybook/react';
import { DietFlagsPanel } from './DietFlagsPanel';
import type { DietFlagsState } from './DietFlagsPanel.types';

const ASSERTED_ONLY: DietFlagsState = {
  asserted: ['vegetarian'],
  warnings: [],
};

const WITH_OVERRIDE: DietFlagsState = {
  asserted: ['vegetarian'],
  override: {
    value: ['vegan', 'vegetarian'],
    reason: 'Confirmed by chef — substituted butter with olive oil',
    appliedBy: 'Lourdes (Manager)',
    appliedAt: '2026-05-04T18:42:11Z',
  },
};

const WITH_WARNINGS: DietFlagsState = {
  asserted: ['vegetarian'],
  warnings: [
    'Candidate flag "vegan" contradicted by milk in Mantequilla',
    'Candidate flag "gluten-free" contradicted by gluten in Tagliatelle',
  ],
};

const meta: Meta<typeof DietFlagsPanel> = {
  title: 'Compliance/DietFlagsPanel',
  component: DietFlagsPanel,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Diet-flag display + Manager+ override modal. Reason field is enforced ≥10 chars client-side per Gate D decision 2. Override applies optimistic update + rolls back on backend rejection.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    state: ASSERTED_ONLY,
    canOverride: true,
    onApplyOverride: async () => undefined,
  },
};

export const WithOverride: Story = {
  args: {
    state: WITH_OVERRIDE,
    canOverride: true,
    onApplyOverride: async () => undefined,
  },
  parameters: {
    docs: {
      description: {
        story: 'Recipe has a Manager+ override applied. Override metadata (who, when, why) renders below the chip row.',
      },
    },
  },
};

export const WithWarnings: Story = {
  args: {
    state: WITH_WARNINGS,
    canOverride: true,
    onApplyOverride: async () => undefined,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Inference engine surfaced warnings: candidate flags contradicted by allergens. Chef can override after reviewing these. The role="note" lines are visible below the flags.',
      },
    },
  },
};

export const StaffViewNoOverride: Story = {
  args: {
    state: WITH_OVERRIDE,
    canOverride: false,
    onApplyOverride: async () => undefined,
  },
  parameters: {
    docs: {
      description: {
        story: 'Staff role: read-only. The Override button is absent from the DOM (not just disabled).',
      },
    },
  },
};

export const RejectionFlow: Story = {
  args: {
    state: ASSERTED_ONLY,
    canOverride: true,
    onApplyOverride: async () => {
      throw new Error('Backend rejected: missing audit signature');
    },
  },
  parameters: {
    docs: {
      description: {
        story:
          'Override rejected by backend → optimistic update rolls back, the rejection message shows via role="alert". Open the modal, fill ≥10 chars, submit to see the rollback.',
      },
    },
  },
};
