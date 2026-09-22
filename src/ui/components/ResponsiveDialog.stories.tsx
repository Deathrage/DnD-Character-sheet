import type { Meta, StoryObj } from '@storybook/react-vite';
import { ResponsiveDialog } from './ResponsiveDialog.js';

const meta = {
  title: 'Components/Responsive dialog',
  component: ResponsiveDialog,
  args: {
    title: 'Edit entry',
    open: true,
    onClose: () => {},
    children: (
      <>
        <label className="dlabel" htmlFor="demo-name">
          Name
        </label>
        <input id="demo-name" className="inp" defaultValue="Sneak Attack" />
        <label className="dlabel mt12" htmlFor="demo-description">
          Description
        </label>
        <textarea
          id="demo-description"
          className="area"
          rows={4}
          defaultValue="+3d6 once per turn when you have advantage or an ally is adjacent to the target."
        />
      </>
    ),
    footer: (
      <button type="button" className="del">
        Delete
      </button>
    ),
  },
} satisfies Meta<typeof ResponsiveDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Criterion 7. There is one story, not two, because there is one component and one CSS
 * breakpoint: switch the viewport toolbar between Phone and Desktop and watch the same dialog
 * become a bottom sheet or a centred modal. Two stories would only prove that two hard-coded
 * widths render, which is not the thing that has to hold.
 */
export const AtBothSizes: Story = {};

/** The persistence gate's presentation: no close button, no scrim dismissal, no Escape. */
export const Blocking: Story = {
  args: {
    title: 'Your characters are not safe here yet',
    blocking: true,
    children: <p className="hint">This browser may delete everything this app has stored.</p>,
    footer: (
      <button type="button" className="primary">
        Make storage permanent
      </button>
    ),
  },
};
