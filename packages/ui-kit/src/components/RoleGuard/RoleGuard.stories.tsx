import type { Meta, StoryObj } from '@storybook/react';
import { RoleGuard } from './RoleGuard';

const meta: Meta<typeof RoleGuard> = {
  title: 'Auth/RoleGuard',
  component: RoleGuard,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'UX-only render gate for role-aware sections. NOT a security primitive — pair every consumer with a server-side `@Roles(...)` decorator. Useful for hiding Owner-only navigation links, settings sections, and preview affordances from non-Owners.',
      },
    },
  },
  args: {
    role: 'OWNER',
    currentRole: 'OWNER',
  },
  argTypes: {
    role: {
      control: 'select',
      options: ['OWNER', 'MANAGER', 'STAFF'],
    },
    currentRole: {
      control: 'select',
      options: [null, 'OWNER', 'MANAGER', 'STAFF'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

const ProtectedSection = () => (
  <div className="rounded-lg border border-border-strong bg-surface p-4">
    <strong>Owner-only configuration</strong>
    <p className="text-sm text-mute">Children render only when the role matches.</p>
  </div>
);

const AccessDenied = () => (
  <div className="rounded-lg border border-dashed border-border-strong p-4 text-mute">
    Permission required.
  </div>
);

export const OwnerSeesSection: Story = {
  args: {
    role: 'OWNER',
    currentRole: 'OWNER',
    fallback: <AccessDenied />,
    children: <ProtectedSection />,
  },
};

export const ManagerBlocked: Story = {
  args: {
    role: 'OWNER',
    currentRole: 'MANAGER',
    fallback: <AccessDenied />,
    children: <ProtectedSection />,
  },
};
