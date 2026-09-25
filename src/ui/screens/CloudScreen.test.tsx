// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { stubDialogElement } from '../../test/stubDialog.js';
import type { CloudView } from '../types.js';
import { CloudScreen } from './CloudScreen.js';

beforeAll(stubDialogElement);

const signedIn: CloudView = {
  status: 'signedIn',
  user: { name: 'Ja', email: 'ja@example.com' },
  usedBytes: 312_400,
  limitBytes: 1_048_576,
  busy: false,
  characters: [
    {
      characterId: 'c1',
      name: 'Zahir',
      level: 5,
      versions: [
        {
          uploadedAt: '2026-09-30T20:11:05.002Z',
          sheetUpdatedAt: '2026-09-30T20:10:00.000Z',
          name: 'Zahir',
          level: 5,
          bytes: 40_000,
          fromNewerApp: false,
          problem: null,
        },
        {
          uploadedAt: '2026-09-24T18:03:12.345Z',
          sheetUpdatedAt: '2026-09-24T17:58:40.120Z',
          name: 'Zahir',
          level: 4,
          bytes: 38_000,
          fromNewerApp: true,
          problem:
            'This file was written by a newer version of the app (schema 2, this build understands 1). Update the app to open it.',
        },
      ],
    },
  ],
};

function renderScreen(view: CloudView, overrides: Partial<Parameters<typeof CloudScreen>[0]> = {}) {
  const props = {
    view,
    message: null,
    conflict: null,
    onBack: vi.fn(),
    onRestore: vi.fn(),
    onDeleteVersion: vi.fn(),
    onDeleteCharacter: vi.fn(),
    onResolveConflict: vi.fn(),
    ...overrides,
  };
  render(<CloudScreen {...props} />);
  return props;
}

describe('CloudScreen', () => {
  it('not signed in, shows only the message: no sign-in, no account, no versions', () => {
    renderScreen(
      { ...signedIn, status: 'unavailable', user: null },
      { message: 'Cloud backup could not be loaded. Check your connection and try again.' },
    );
    expect(screen.getByRole('alert').textContent).toMatch(/could not be loaded/);
    expect(screen.queryByRole('button', { name: /Sign in/ })).toBeNull();
    expect(screen.queryByText(/ja@example.com/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Restore' })).toBeNull();
  });

  it('shows the account and the usage out of the limit', () => {
    renderScreen(signedIn);
    expect(screen.getByText(/ja@example\.com/)).toBeTruthy();
    expect(screen.getByText('312.4 KB')).toBeTruthy();
    expect(screen.getByText('of 1.0 MB')).toBeTruthy();
    expect(screen.getByText('ID: c1')).toBeTruthy();
  });

  it('goes back to the characters', () => {
    const props = renderScreen(signedIn);
    fireEvent.click(screen.getByRole('button', { name: 'Back to characters' }));
    expect(props.onBack).toHaveBeenCalledOnce();
  });

  it('restores the version whose button was pressed', () => {
    const props = renderScreen(signedIn);
    fireEvent.click(screen.getAllByRole('button', { name: 'Restore' })[0]!);
    expect(props.onRestore).toHaveBeenCalledWith('c1', '2026-09-30T20:11:05.002Z');
  });

  it('flags a version from a newer app', () => {
    renderScreen(signedIn);
    expect(screen.getByText(/newer version of the app/)).toBeTruthy();
  });

  it('flags an unreadable version with its reason, and will not restore it', () => {
    const view: CloudView = {
      ...signedIn,
      characters: [
        {
          characterId: 'c1',
          name: null,
          level: null,
          versions: [
            {
              uploadedAt: '2026-09-30T20:11:05.002Z',
              sheetUpdatedAt: null,
              name: null,
              level: null,
              bytes: 3,
              fromNewerApp: false,
              problem: 'This cloud version is damaged. incorrect header check',
            },
          ],
        },
      ],
    };
    renderScreen(view);
    expect(screen.getByRole('heading', { name: 'Unreadable character' })).toBeTruthy();
    expect(screen.getByText(/This cloud version is damaged/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Restore' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.getByRole('button', { name: /^Delete version/ })).toBeTruthy();
  });

  it('deletes a version only after confirming', () => {
    const props = renderScreen(signedIn);
    fireEvent.click(screen.getAllByRole('button', { name: /^Delete version/ })[0]!);
    expect(props.onDeleteVersion).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    expect(props.onDeleteVersion).toHaveBeenCalledWith('c1', '2026-09-30T20:11:05.002Z');
  });

  it('asks Replace or Keep both, says which copy is older, and answers', () => {
    const props = renderScreen(signedIn, {
      conflict: {
        name: 'Zahir',
        localUpdatedAt: '2026-09-30T20:10:00.000Z',
        incomingUpdatedAt: '2026-09-24T17:58:40.120Z',
      },
    });
    expect(screen.getByText(/Zahir is already in this app/)).toBeTruthy();
    expect(screen.getByText(/The cloud version is older/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Keep both' }));
    expect(props.onResolveConflict).toHaveBeenCalledWith('keepBoth');
  });

  it('asks again before Replace, and Back returns to the question', () => {
    const props = renderScreen(signedIn, {
      conflict: {
        name: 'Zahir',
        localUpdatedAt: null,
        incomingUpdatedAt: '2026-09-24T17:58:40.120Z',
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Replace' }));
    expect(props.onResolveConflict).not.toHaveBeenCalled();
    expect(screen.getByText(/copy of Zahir will be overwritten/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(screen.getByRole('button', { name: 'Replace' }));
    expect(props.onResolveConflict).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Replace' }));
    expect(props.onResolveConflict).toHaveBeenCalledWith('replace');
  });

  it('calls a damaged local copy damaged', () => {
    renderScreen(signedIn, {
      conflict: {
        name: 'Zahir',
        localUpdatedAt: null,
        incomingUpdatedAt: '2026-09-24T17:58:40.120Z',
      },
    });
    expect(screen.getByText(/This app's copy: damaged/)).toBeTruthy();
  });
});
