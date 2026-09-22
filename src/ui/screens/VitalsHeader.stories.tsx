import type { Meta, StoryObj } from '@storybook/react-vite';
import { blankCharacter, noVitalsActions, sable } from '../fixtures.js';
import { VitalsHeader } from './VitalsHeader.js';

const meta = {
  title: 'Screens/Vitals header',
  component: VitalsHeader,
  args: { actions: noVitalsActions, onBack: () => {} },
} satisfies Meta<typeof VitalsHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Filled: Story = { args: { character: sable } };

/** A character straight out of `createCharacter`: no classes, no hit dice, level 0. */
export const Blank: Story = { args: { character: blankCharacter } };

/**
 * Duplicate class names are the one `RuleViolation` the UI is expected to present rather than
 * crash on (`errors.ts`). Open the classes dialog to see it: this story's `addClass` rejects
 * everything, standing in for a name already in use.
 */
export const ClassNameRejected: Story = {
  args: {
    character: sable,
    actions: {
      ...noVitalsActions,
      addClass: () => 'a class named "Rogue (Arcane Trickster)" already exists',
      renameClass: () => 'a class named "Wizard (Evoker)" already exists',
    },
  },
};
