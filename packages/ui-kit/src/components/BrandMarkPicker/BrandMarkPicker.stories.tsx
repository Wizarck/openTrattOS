import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { BrandMarkPicker } from './BrandMarkPicker';
import type { BrandMarkPickerProps } from './BrandMarkPicker.types';

const meta: Meta<typeof BrandMarkPicker> = {
  title: 'Compliance/BrandMarkPicker',
  component: BrandMarkPicker,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Drag-and-drop / click-to-pick / external-URL fallback for an organisation\'s brand mark. Presentational — the parent owns the upload mutation and threads progress + errors via props. Backend endpoint: `POST /api/organizations/:id/brand-mark`.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

function Interactive(props: Partial<BrandMarkPickerProps>): JSX.Element {
  const [value, setValue] = useState<string | undefined>(props.value);
  return (
    <div className="w-[480px]">
      <BrandMarkPicker
        value={value}
        onFilePicked={(file) => alert(`File picked: ${file.name} (${file.type}, ${file.size}B)`)}
        onUrlChanged={setValue}
        onClear={() => setValue(undefined)}
        {...props}
      />
    </div>
  );
}

export const Empty: Story = {
  render: () => <Interactive />,
};

export const WithLogo: Story = {
  render: () => <Interactive value="https://placehold.co/200x80/png?text=ACME" />,
};

export const Uploading: Story = {
  render: () => <Interactive uploading />,
};

export const WithError: Story = {
  render: () => (
    <Interactive error="Archivo demasiado grande (2.4 MB). Máximo permitido: 2 MB." />
  ),
};

export const WithSuccessInfo: Story = {
  render: () => (
    <Interactive
      value="https://placehold.co/200x80/png?text=ACME"
      successInfo="Logotipo guardado · 200×80 · 4.2 KB"
    />
  ),
};

export const Disabled: Story = {
  render: () => <Interactive value="https://placehold.co/200x80/png?text=ACME" disabled />,
};
