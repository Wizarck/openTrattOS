import type { Meta, StoryObj } from '@storybook/react';
import { ExportProgressStrip } from './ExportProgressStrip';

const STEPS = [
  { key: 'index_audit_log', label: 'Indexando audit_log' },
  { key: 'compose_chapter_0', label: 'Componiendo capítulo 0' },
  { key: 'render_derivatives', label: 'Renderizando vistas derivativas' },
  { key: 'seal_hash', label: 'Sellando hash de bundle' },
  { key: 'done', label: 'Listo' },
];

const meta: Meta<typeof ExportProgressStrip> = {
  title: 'APPCC/ExportProgressStrip',
  component: ExportProgressStrip,
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {
  args: { steps: STEPS, currentStepIndex: 0, status: 'in-progress' },
};

export const Halfway: Story = {
  args: {
    steps: STEPS,
    currentStepIndex: 2,
    status: 'in-progress',
    sizeBytes: 1_200_000,
    pageCount: 24,
  },
};

export const Done: Story = {
  args: {
    steps: STEPS,
    currentStepIndex: 4,
    status: 'done',
    sizeBytes: 2_300_000,
    pageCount: 48,
  },
};

export const Failed: Story = {
  args: {
    steps: STEPS,
    currentStepIndex: 3,
    status: 'failed',
    onRetry: () => {},
  },
};
