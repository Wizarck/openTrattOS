import type { Meta, StoryObj } from '@storybook/react';
import { AuditLogFilters } from './AuditLogFilters';
import { EMPTY_AUDIT_FILTER_VALUES } from './AuditLogFilters.types';

const meta: Meta<typeof AuditLogFilters> = {
  title: 'Compliance/AuditLogFilters',
  component: AuditLogFilters,
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    values: { ...EMPTY_AUDIT_FILTER_VALUES },
    onChange: () => {},
    onApply: () => {},
    onReset: () => {},
    onExportCsv: () => {},
  },
};

export const WithSelections: Story = {
  args: {
    values: {
      eventType: ['AGENT_ACTION_FORENSIC', 'INGREDIENT_OVERRIDE_CHANGED'],
      aggregateType: 'recipe',
      actorKind: 'user',
      since: '2026-04-01',
      until: '2026-05-08',
      q: 'tomate',
    },
    onChange: () => {},
    onApply: () => {},
    onReset: () => {},
    onExportCsv: () => {},
  },
};

export const Applying: Story = {
  args: {
    values: { ...EMPTY_AUDIT_FILTER_VALUES },
    applying: true,
    onChange: () => {},
    onApply: () => {},
    onReset: () => {},
    onExportCsv: () => {},
  },
};
