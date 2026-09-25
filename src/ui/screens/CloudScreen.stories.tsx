import type { Meta, StoryObj } from '@storybook/react-vite';
import { CloudScreen } from './CloudScreen.js';

const meta = {
  title: 'Screens/Cloud',
  component: CloudScreen,
  args: {
    message: null,
    conflict: null,
    onBack: () => {},
    onSignIn: () => {},
    onSignOut: () => {},
    onRestore: () => {},
    onDeleteVersion: () => {},
    onDeleteCharacter: () => {},
    onResolveConflict: () => {},
    view: {
      status: 'signedIn',
      user: { name: 'Ja', email: 'ja@example.com' },
      totalBytes: 78_000,
      busy: false,
      characters: [
        {
          characterId: 'c1',
          name: 'Zahir ibn Talaar',
          level: 5,
          versions: [
            {
              uploadedAt: '2026-09-30T20:11:05.002Z',
              sheetUpdatedAt: '2026-09-30T20:10:00.000Z',
              name: 'Zahir ibn Talaar',
              level: 5,
              bytes: 40_000,
              fromNewerApp: false,
            },
            {
              uploadedAt: '2026-09-24T18:03:12.345Z',
              sheetUpdatedAt: '2026-09-24T17:58:40.120Z',
              name: 'Zahir ibn Talaar',
              level: 4,
              bytes: 38_000,
              fromNewerApp: false,
            },
          ],
        },
      ],
    },
  },
} satisfies Meta<typeof CloudScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SignedIn: Story = {};
export const SignedOut: Story = {
  args: { view: { status: 'signedOut', user: null, characters: [], totalBytes: 0, busy: false } },
};
export const Conflict: Story = {
  args: {
    conflict: {
      name: 'Zahir ibn Talaar',
      localUpdatedAt: '2026-09-30T20:10:00.000Z',
      incomingUpdatedAt: '2026-09-24T17:58:40.120Z',
    },
  },
};
