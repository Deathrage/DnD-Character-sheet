import type { Meta, StoryObj } from '@storybook/react-vite';
import { counters, noCountersActions } from '../fixtures.js';
import { Counters } from './Counters.js';

const meta = {
  title: 'Screens/Counters',
  component: Counters,
  args: { actions: noCountersActions, onClose: () => {} },
} satisfies Meta<typeof Counters>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Levels with no slots are hidden rather than shown as 0/0 — “Set totals” brings them back. */
export const Populated: Story = { args: { data: counters } };

export const Empty: Story = {
  args: {
    data: {
      categories: [],
      uncategorized: [],
      spellSlots: [1, 2, 3, 4, 5, 6, 7, 8, 9].map((level) => ({ level, current: 0, total: 0 })),
    },
  },
};
