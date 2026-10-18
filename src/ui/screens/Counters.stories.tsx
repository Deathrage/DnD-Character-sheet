import type { Meta, StoryObj } from '@storybook/react-vite';
import { counters, noCountersActions } from '../fixtures.js';
import { Counters } from './Counters.js';

const meta = {
  title: 'Screens/Counters',
  component: Counters,
  args: { characterId: 'story', actions: noCountersActions, onClose: () => {} },
} satisfies Meta<typeof Counters>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Levels with no slots are hidden rather than shown as 0/0 — “Edit” brings them back. */
export const Populated: Story = { args: { data: counters } };

/** A warlock: pact slots only, so the table is one row. */
export const Warlock: Story = {
  args: {
    data: {
      ...counters,
      spellSlots: counters.spellSlots.map((slot) => ({ ...slot, current: 0, total: 0 })),
      pactSlots: { level: 3, current: 1, total: 2 },
    },
  },
};

/** A warlock multiclassed into a full caster: the pact row first, then the ordinary levels. */
export const Multiclass: Story = {
  args: { data: { ...counters, pactSlots: { level: 3, current: 1, total: 2 } } },
};

/** No slots of either kind: only the button that sets some up. */
export const Empty: Story = {
  args: {
    data: {
      categories: [],
      uncategorized: [],
      spellSlots: [1, 2, 3, 4, 5, 6, 7, 8, 9].map((level) => ({ level, current: 0, total: 0 })),
      pactSlots: { level: 1, current: 0, total: 0 },
    },
  },
};
