import type { Meta, StoryObj } from '@storybook/react-vite';
import { companions, noCompanionsActions } from '../fixtures.js';
import { Companions } from './Companions.js';

const meta = {
  title: 'Screens/Companions',
  component: Companions,
  args: { characterId: 'story', actions: noCompanionsActions, onClose: () => {} },
} satisfies Meta<typeof Companions>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The Vestige (hit dice, a counter, initiative off) and the Owl (initiative on, no hit dice). */
export const Populated: Story = { args: { data: companions } };

/** No companions: only the button that makes one. */
export const Empty: Story = { args: { data: [] } };
