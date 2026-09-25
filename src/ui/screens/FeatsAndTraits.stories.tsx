import type { Meta, StoryObj } from '@storybook/react-vite';
import { emptyFeatsAndTraits, featsAndTraits, noFeatsActions } from '../fixtures.js';
import { FeatsAndTraits } from './FeatsAndTraits.js';

const meta = {
  title: 'Screens/Feats & Traits',
  component: FeatsAndTraits,
  args: { characterId: 'story', actions: noFeatsActions, onClose: () => {} },
} satisfies Meta<typeof FeatsAndTraits>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = { args: { data: featsAndTraits } };

/** No categories at all — everything a new character has is the Uncategorized block. */
export const Empty: Story = { args: { data: emptyFeatsAndTraits } };

/**
 * Criterion 6: a duplicate category name is rejected with a visible message. Open "+ New
 * category" (or a category's pencil) — this story's actions reject every name.
 */
export const DuplicateCategoryRejected: Story = {
  args: {
    data: featsAndTraits,
    actions: {
      ...noFeatsActions,
      createCategory: () => 'a category named "Rogue" already exists',
      renameCategory: () => 'a category named "Wizard" already exists',
    },
  },
};
