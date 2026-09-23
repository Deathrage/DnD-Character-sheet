import type { Meta, StoryObj } from '@storybook/react-vite';
import { characterRows, damagedRow } from '../fixtures.js';
import { CharacterList } from './CharacterList.js';

const meta = {
  title: 'Screens/Character list',
  component: CharacterList,
  args: {
    onOpen: () => {},
    onOpenRawJson: () => {},
    onCreate: () => {},
    onImport: () => {},
    onClone: () => {},
    onDelete: () => {},
  },
} satisfies Meta<typeof CharacterList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = { args: { rows: characterRows } };

export const Empty: Story = { args: { rows: [] } };

/** Criterion 15: a document that fails to load is still listed, flagged, and opens its raw JSON. */
export const WithDamagedCharacter: Story = {
  args: { rows: [...characterRows, damagedRow] },
};
