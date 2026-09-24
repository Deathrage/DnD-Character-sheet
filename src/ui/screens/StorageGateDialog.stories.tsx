import type { Meta, StoryObj } from '@storybook/react-vite';
import { characterRows } from '../fixtures.js';
import { CharacterList } from './CharacterList.js';
import { StorageGateDialog } from './StorageGateDialog.js';

const meta = {
  title: 'Screens/Storage gate',
  component: StorageGateDialog,
  args: {
    estimate: { usage: 184_320, quota: 2_147_483_648 },
    onRequestPersist: () => {},
    onContinueSession: () => {},
    onInstall: () => {},
    install: { kind: 'prompt' },
    asksPermission: false,
  },
  // The gate covers the character list, which is the point of it being blocking — so the list
  // is rendered behind it rather than showing the dialog against an empty page.
  decorators: [
    (Story) => (
      <>
        <CharacterList
          rows={characterRows}
          onOpen={() => {}}
          onOpenRawJson={() => {}}
          onCreate={() => {}}
          onImport={() => {}}
          onClone={() => {}}
          onDelete={() => {}}
        />
        <Story />
      </>
    ),
  ],
} satisfies Meta<typeof StorageGateDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Criterion 13: no close button, no scrim dismissal, no Escape. Try all three. */
export const Ask: Story = { args: { phase: 'ask' } };

/** Criterion 14: after a refusal it names the levers, and offers a session-only escape. */
export const Refused: Story = { args: { phase: 'refused' } };

/** Safari and iOS install, but a page cannot start it: the steps are named instead. */
export const RefusedWithSteps: Story = {
  args: {
    phase: 'refused',
    install: {
      kind: 'steps',
      steps: 'Tap the Share button, choose Add to Home Screen, then open the app from its icon.',
    },
  },
};

/** Firefox asked the player, who blocked it: the fix is resetting the permission. */
export const RefusedFirefox: Story = {
  args: { phase: 'refused', install: { kind: 'unavailable' }, asksPermission: true },
};
