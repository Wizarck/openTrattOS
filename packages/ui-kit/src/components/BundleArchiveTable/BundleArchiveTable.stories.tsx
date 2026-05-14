import type { Meta, StoryObj } from '@storybook/react';
import { BundleArchiveTable } from './BundleArchiveTable';

const TYPICAL = [
  {
    bundleId: 'b-1',
    generatedAt: '2026-05-13T14:32:00Z',
    rangeLabel: '12 feb - 13 may 2026',
    locale: 'es-ES',
    scopeLabel: 'HACCP + Lot',
    generatedByActor: 'Iker Arana',
    sha256Short: 'a9f3…b274',
    archived: false,
  },
  {
    bundleId: 'b-2',
    generatedAt: '2026-02-10T09:14:00Z',
    rangeLabel: '10 nov 2025 - 10 feb 2026',
    locale: 'es-ES',
    scopeLabel: 'HACCP + Lot + Procurement',
    generatedByActor: 'Iker Arana',
    sha256Short: '7c2a…91ee',
    archived: false,
  },
];

const meta: Meta<typeof BundleArchiveTable> = {
  title: 'APPCC/BundleArchiveTable',
  component: BundleArchiveTable,
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Typical: Story = {
  args: { rows: TYPICAL, onDownload: () => {} },
};

export const WithColdStorage: Story = {
  args: {
    rows: [
      ...TYPICAL,
      {
        bundleId: 'b-3',
        generatedAt: '2025-11-12T11:48:00Z',
        rangeLabel: '12 ago - 12 nov 2025',
        locale: 'eu-ES',
        scopeLabel: 'HACCP + Lot',
        generatedByActor: 'Iker Arana',
        sha256Short: '3f81…b520',
        archived: true,
      },
    ],
    onDownload: () => {},
    onRestore: () => {},
  },
};
