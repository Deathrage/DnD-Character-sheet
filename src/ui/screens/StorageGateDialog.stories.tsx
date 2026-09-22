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
