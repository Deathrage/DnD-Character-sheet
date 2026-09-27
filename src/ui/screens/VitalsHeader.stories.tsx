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

/** At 0 hit points the death saves open in the hit points tile. The player ticks every box. */
export const Dying: Story = {
  args: {
    character: {
      ...sable,
      hitPoints: {
        ...sable.hitPoints,
        current: 0,
        temporary: 0,
        deathSaves: { successes: 1, failures: 2 },
      },
    },
  },
};

/**
 * Healed, but the ticks are still there: the app never clears them, so the row stays until the
 * player presses Clear.
 */
export const HealedBeforeClearing: Story = {
  args: {
    character: {
      ...sable,
      hitPoints: { ...sable.hitPoints, current: 12, deathSaves: { successes: 3, failures: 1 } },
    },
  },
};

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
