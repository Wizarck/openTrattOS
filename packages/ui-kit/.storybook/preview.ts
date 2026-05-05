import type { Preview } from '@storybook/react';
import '../src/globals.css';

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: 'cream',
      values: [
        { name: 'cream', value: 'oklch(94.5% 0.012 70)' },
        { name: 'oat', value: 'oklch(91.5% 0.014 70)' },
        { name: 'ink', value: 'oklch(20% 0.010 60)' },
      ],
    },
    viewport: {
      viewports: {
        kitchenTablet: {
          name: 'Kitchen tablet (10" landscape)',
          styles: { width: '1024px', height: '768px' },
        },
        ownerMobile: {
          name: 'Owner mobile (iPhone 14)',
          styles: { width: '390px', height: '844px' },
        },
      },
    },
    controls: {
      matchers: { color: /(background|color)$/i, date: /Date$/i },
    },
    a11y: {
      config: { rules: [{ id: 'color-contrast', enabled: true }] },
    },
  },
  tags: ['autodocs'],
};

export default preview;
