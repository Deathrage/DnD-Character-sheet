import type { Meta, StoryObj } from '@storybook/react-vite';
import { abilitiesAndSkills, noAbilitiesActions } from '../fixtures.js';
import { AbilitiesAndSkills } from './AbilitiesAndSkills.js';

const meta = {
  title: 'Screens/Abilities & Skills',
  component: AbilitiesAndSkills,
  args: { actions: noAbilitiesActions, onClose: () => {} },
} satisfies Meta<typeof AbilitiesAndSkills>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Every number here is typed by the player. The P and E marks are labels, not inputs — ticking
 * one changes nothing else on the row, because the app computes nothing.
 */
export const Populated: Story = { args: { data: abilitiesAndSkills } };
