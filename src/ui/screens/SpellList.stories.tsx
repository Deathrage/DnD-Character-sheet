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

export const Empty: Story = {
  args: { data: { categories: [], uncategorized: [], spellcasting: [] } },
};

/** A triple multiclass: the third chip wraps onto a new line rather than scrolling (spec §5.1). */
export const ThreeCasters: Story = {
  args: {
    data: {
      ...spellList,
      spellcasting: [
        { ability: 'intelligence', attackBonus: 6, saveDc: 14 },
        { ability: 'wisdom', attackBonus: 7, saveDc: 15 },
        { ability: 'charisma', attackBonus: 4, saveDc: 12 },
      ],
    },
  },
};
