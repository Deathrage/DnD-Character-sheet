import type { Meta, StoryObj } from '@storybook/react-vite';
import { equipment, noEquipmentActions } from '../fixtures.js';
import { Equipment } from './Equipment.js';

const meta = {
  title: 'Screens/Equipment',
  component: Equipment,
  args: { characterId: 'story', actions: noEquipmentActions, onClose: () => {} },
} satisfies Meta<typeof Equipment>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Attuned and Equipped are derived views over Weapons and Other, so an item appears twice and
 * neither derived block has an add button — the toggles in its dialog are what put it there.
 */
export const Populated: Story = { args: { data: equipment } };

export const Empty: Story = {
  args: { data: { weapons: [], other: [], attuned: [], equipped: [] } },
};
