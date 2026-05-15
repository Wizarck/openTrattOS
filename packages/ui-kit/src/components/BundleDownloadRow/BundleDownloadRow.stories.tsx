import type { Meta, StoryObj } from '@storybook/react';
import { BundleDownloadRow } from './BundleDownloadRow';

const BUNDLE = {
  bundleId: 'b-1',
  sha256: 'a9f3…b274',
  auditLogId: 'AL-2026-189554',
  generatedAt: '2026-05-15T12:32:00Z',
  locale: 'es-ES',
  pdfSizeBytes: 2_300_000,
  pdfPageCount: 48,
  csvSizeBytes: 412_000,
};

const meta: Meta<typeof BundleDownloadRow> = {
  title: 'APPCC/BundleDownloadRow',
  component: BundleDownloadRow,
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    bundle: BUNDLE,
    dispatchedRecipients: 0,
    onDownloadPdf: () => {},
    onDownloadCsv: () => {},
  },
};

export const WithEmailDispatched: Story = {
  args: {
    bundle: BUNDLE,
    dispatchedRecipients: 2,
    onDownloadPdf: () => {},
    onDownloadCsv: () => {},
  },
};
