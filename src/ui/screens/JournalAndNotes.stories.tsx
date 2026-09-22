import type { Meta, StoryObj } from '@storybook/react-vite';
import { journalAndNotes, noJournalActions } from '../fixtures.js';
import { JournalAndNotes } from './JournalAndNotes.js';

const meta = {
  title: 'Screens/Journal & Notes',
  component: JournalAndNotes,
  args: { actions: noJournalActions, onClose: () => {} },
} satisfies Meta<typeof JournalAndNotes>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Days are a queue: the newest is outlined, and it is the only one that can be deleted. */
export const Populated: Story = { args: { data: journalAndNotes } };

export const Empty: Story = { args: { data: { days: [], notes: '' } } };
