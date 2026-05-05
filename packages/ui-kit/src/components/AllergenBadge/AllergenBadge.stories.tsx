import type { Meta, StoryObj } from '@storybook/react';
import { AllergenBadge } from './AllergenBadge';

const meta: Meta<typeof AllergenBadge> = {
  title: 'Compliance/AllergenBadge',
  component: AllergenBadge,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'EU 1169/2011 Article 21 allergen badge. Icon + text always; never colour-only. The `emphasised` variant satisfies Article 21\'s "conspicuous emphasis" requirement.',
      },
    },
  },
  args: {
    allergen: 'gluten',
    emphasised: false,
  },
  argTypes: {
    allergen: { control: 'text' },
    emphasised: { control: 'boolean' },
    crossContamination: { control: 'boolean' },
    label: { control: 'text' },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { allergen: 'gluten' },
};

export const Article21Emphasis: Story = {
  args: { allergen: 'milk', emphasised: true },
  parameters: {
    docs: {
      description: {
        story:
          'Bold weight + paprika background ≥5:1 contrast against the cream surface. This is the variant required for EU 1169/2011 Article 21 conformance on labels.',
      },
    },
  },
};

export const ListOfThree: Story = {
  render: () => (
    <ul className="flex flex-wrap gap-2 list-none p-0 m-0">
      <li><AllergenBadge allergen="gluten" emphasised /></li>
      <li><AllergenBadge allergen="milk" emphasised /></li>
      <li><AllergenBadge allergen="eggs" emphasised /></li>
    </ul>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'A typical recipe with multiple allergens. Each badge is independent; the screen-reader announces them as separate `status` regions.',
      },
    },
  },
};

export const CrossContamination: Story = {
  args: { allergen: 'peanuts', crossContamination: true },
  parameters: {
    docs: {
      description: {
        story:
          'Cross-contamination variant uses a dashed border + "may contain" prefix to disclose facility-level risk that the recipe itself does not carry.',
      },
    },
  },
};

export const CustomLabel: Story = {
  args: { allergen: 'tree-nuts', label: 'Frutos secos', emphasised: true },
  parameters: {
    docs: {
      description: {
        story: 'i18n hook: pass `label` to override the default title-case rendering of the allergen code.',
      },
    },
  },
};
