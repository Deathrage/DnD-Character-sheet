import type { Preview } from '@storybook/react-vite';
import '../src/ui/styles.css';

/**
 * The two viewports that matter are the two sides of the one breakpoint in the app: a dialog is
 * a bottom sheet below 640px and a centred modal at or above it (spec §7, criterion 7). Having
 * both in the toolbar is how that gets reviewed without a device — spec §9 asks for exactly
 * this.
 */
const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
    viewport: {
      options: {
        phone: { name: 'Phone (390px)', styles: { width: '390px', height: '780px' } },
        desktop: { name: 'Desktop (1024px)', styles: { width: '1024px', height: '800px' } },
      },
    },
  },
  initialGlobals: { viewport: { value: 'phone' } },
};

export default preview;
