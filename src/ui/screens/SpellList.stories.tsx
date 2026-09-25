import type { Meta, StoryObj } from '@storybook/react-vite';
import { noSpellListActions, spellList } from '../fixtures.js';
import { SpellList } from './SpellList.js';

const meta = {
  title: 'Screens/Spell List',
  component: SpellList,
  args: { characterId: 'story', actions: noSpellListActions, onClose: () => {} },
} satisfies Meta<typeof SpellList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Unprepared spells are dimmed; the dot toggles prepared without opening the spell. */
export const Populated: Story = { args: { data: spellList } };

export const Empty: Story = { args: { data: { categories: [], uncategorized: [] } } };
