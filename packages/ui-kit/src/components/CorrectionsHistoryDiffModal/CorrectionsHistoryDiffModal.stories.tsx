import type { Meta, StoryObj } from '@storybook/react';
import { CorrectionsHistoryDiffModal } from './CorrectionsHistoryDiffModal';
import type { CorrectionsHistoryFieldDiff } from './CorrectionsHistoryDiffModal.types';
import type { CorrectionsHistoryEntry } from '../CorrectionsHistoryList/CorrectionsHistoryList.types';

const ENTRY: CorrectionsHistoryEntry = {
  correctionId: '33333333-3333-4333-8333-333333333333',
  correctedAt: '2026-05-15T11:50:00.000Z',
  correctedByUserId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  reason:
    'Corrección retroactiva al detectar discrepancia en la cantidad recibida después de re-pesar el palé en la zona de recepción esta mañana',
  fieldsChanged: 3,
};

const DIFFS: CorrectionsHistoryFieldDiff[] = [
  {
    fieldName: 'lineItems[0].quantity',
    oldValue: '10',
    newValue: '12',
  },
  {
    fieldName: 'lineItems[0].unitPrice',
    oldValue: '1.50',
    newValue: '1.75',
  },
  {
    fieldName: 'supplierInvoiceRef',
    oldValue: null,
    newValue: 'INV-2026-3398',
  },
];

const ENTRY_NO_REASON: CorrectionsHistoryEntry = {
  ...ENTRY,
  correctionId: '44444444-4444-4444-8444-444444444444',
  reason: null,
};

const meta: Meta<typeof CorrectionsHistoryDiffModal> = {
  title: 'photo-ingest/CorrectionsHistoryDiffModal',
  component: CorrectionsHistoryDiffModal,
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof CorrectionsHistoryDiffModal>;

export const ThreeFieldChanges: Story = {
  args: { entry: ENTRY, diffs: DIFFS, onClose: () => {} },
};

export const NoReason: Story = {
  args: { entry: ENTRY_NO_REASON, diffs: DIFFS, onClose: () => {} },
};

export const Empty: Story = {
  args: { entry: ENTRY, diffs: [], onClose: () => {} },
};

export const LongReasonAndManyFields: Story = {
  args: {
    entry: {
      ...ENTRY,
      reason:
        'Tras la auditoría de inventario del cierre del lunes, se detectó que la recepción del proveedor del jueves anterior tenía una discrepancia importante en el peso recibido. Se corrige el lote afectado y se actualiza la factura de referencia con la versión definitiva que el proveedor envió ya conciliada.',
    },
    diffs: [
      ...DIFFS,
      { fieldName: 'lineItems[1].quantity', oldValue: '5', newValue: '4' },
      { fieldName: 'lineItems[1].unitPrice', oldValue: '0.85', newValue: '0.90' },
      { fieldName: 'receivedAt', oldValue: '2026-05-08T07:30:00.000Z', newValue: '2026-05-08T07:45:00.000Z' },
    ],
    onClose: () => {},
  },
};
