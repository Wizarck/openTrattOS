import type { Meta, StoryObj } from '@storybook/react';
import { AuditLogTable } from './AuditLogTable';
import type { AuditLogRow } from './AuditLogTable.types';

const meta: Meta<typeof AuditLogTable> = {
  title: 'Compliance/AuditLogTable',
  component: AuditLogTable,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Owner+Manager table for the audit_log query result. 6 columns: timestamp, event type, aggregate, actor, reason, expand toggle. Click any row to expand its payload_before/payload_after via <AuditLogRowDetail>.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

const sampleRows: AuditLogRow[] = [
  {
    id: 'row-1',
    eventType: 'AGENT_ACTION_FORENSIC',
    aggregateType: 'recipe',
    aggregateId: '00000000-0000-4000-8000-000000000001',
    actorUserId: 'user-1',
    actorKind: 'agent',
    agentName: 'claude-desktop',
    payloadBefore: { name: 'Bolognesa', portions: 4 },
    payloadAfter: { name: 'Bolognesa renamed', portions: 6 },
    reason: 'recipes.update',
    citationUrl: null,
    snippet: null,
    createdAt: '2026-05-08T12:34:56.000Z',
  },
  {
    id: 'row-2',
    eventType: 'INGREDIENT_OVERRIDE_CHANGED',
    aggregateType: 'ingredient',
    aggregateId: '11111111-1111-4111-8111-111111111111',
    actorUserId: 'user-2',
    actorKind: 'user',
    agentName: null,
    payloadBefore: null,
    payloadAfter: { field: 'allergens' },
    reason: 'Confirmed gluten-free by supplier',
    citationUrl: 'https://fdc.nal.usda.gov/product/12345',
    snippet: 'USDA: gluten-free certification',
    createdAt: '2026-05-08T11:00:00.000Z',
  },
];

export const Empty: Story = {
  args: { rows: [], expandedRowId: null, onToggleExpand: () => {} },
};

export const Loading: Story = {
  args: { rows: [], expandedRowId: null, loading: true, onToggleExpand: () => {} },
};

export const Filled: Story = {
  args: { rows: sampleRows, expandedRowId: null, onToggleExpand: () => {} },
};

export const Expanded: Story = {
  args: { rows: sampleRows, expandedRowId: 'row-1', onToggleExpand: () => {} },
};
