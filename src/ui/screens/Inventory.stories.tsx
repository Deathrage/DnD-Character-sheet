import type { Meta, StoryObj } from '@storybook/react-vite';
import { inventory, noInventoryActions } from '../fixtures.js';
import { Inventory } from './Inventory.js';

const meta = {
  title: 'Screens/Inventory',
  component: Inventory,
  args: { actions: noInventoryActions, onClose: () => {} },
} satisfies Meta<typeof Inventory>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The count is editable from the row, without opening the item. */
export const Populated: Story = { args: { data: inventory } };

export const Empty: Story = {
  args: { data: { coins: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 }, items: [] } },
};
