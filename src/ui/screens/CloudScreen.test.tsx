// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { stubDialogElement } from '../../test/stubDialog.js';
import type { CloudView } from '../types.js';
import { CloudScreen } from './CloudScreen.js';

beforeAll(stubDialogElement);

const signedIn: CloudView = {
  status: 'signedIn',
  user: { name: 'Ja', email: 'ja@example.com' },
  totalBytes: 3_400_000,
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
        },
        {
          uploadedAt: '2026-09-24T18:03:12.345Z',
          sheetUpdatedAt: '2026-09-24T17:58:40.120Z',
          name: 'Zahir',
          level: 4,
          bytes: 38_000,
          fromNewerApp: true,
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
    onSignIn: vi.fn(),
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
  it('signed out, offers only Google sign-in', () => {
    const props = renderScreen({ ...signedIn, status: 'signedOut', user: null, characters: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));
    expect(props.onSignIn).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: /Restore/ })).toBeNull();
  });

  it('shows the account and the usage', () => {
    renderScreen(signedIn);
    expect(screen.getByText(/ja@example\.com/)).toBeTruthy();
    expect(screen.getByText('3.4 MB')).toBeTruthy();
    expect(screen.getByText('ID: c1')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull();
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
