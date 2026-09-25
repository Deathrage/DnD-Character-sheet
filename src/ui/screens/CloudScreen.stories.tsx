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
    onRestore: () => {},
    onDeleteVersion: () => {},
    onDeleteCharacter: () => {},
    onResolveConflict: () => {},
    view: {
      status: 'signedIn',
      user: { name: 'Ja', email: 'ja@example.com' },
      usedBytes: 78_000,
      limitBytes: 1_048_576,
      busy: false,
      characters: [
        {
          characterId: '3f2a9c1e-7b4d-4e8a-9c2f-5d1b6a7e8f90',
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
              problem: null,
            },
            {
              uploadedAt: '2026-09-24T18:03:12.345Z',
              sheetUpdatedAt: '2026-09-24T17:58:40.120Z',
              name: 'Zahir ibn Talaar',
              level: 4,
              bytes: 38_000,
              fromNewerApp: false,
              problem: null,
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
  args: {
    view: {
      status: 'signedOut',
      user: null,
      characters: [],
      usedBytes: 0,
      limitBytes: 1_048_576,
      busy: false,
    },
  },
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
export const Damaged: Story = {
  args: {
    view: {
      status: 'signedIn',
      user: { name: 'Ja', email: 'ja@example.com' },
      usedBytes: 3_000,
      limitBytes: 1_048_576,
      busy: false,
      characters: [
        {
          characterId: '3f2a9c1e-7b4d-4e8a-9c2f-5d1b6a7e8f90',
          name: null,
          level: null,
          versions: [
            {
              uploadedAt: '2026-09-30T20:11:05.002Z',
              sheetUpdatedAt: null,
              name: null,
              level: null,
              bytes: 3_000,
              fromNewerApp: false,
              problem: 'This cloud version is damaged. incorrect header check',
            },
          ],
        },
      ],
    },
  },
};
