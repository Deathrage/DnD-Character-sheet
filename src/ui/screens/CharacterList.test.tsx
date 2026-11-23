// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { stubDialogElement } from '../../test/stubDialog.js';
import type { DiagnosticsView, InstallView } from '../types.js';
import { CharacterList } from './CharacterList.js';

beforeAll(stubDialogElement);

function list(extra: Partial<ComponentProps<typeof CharacterList>> = {}) {
  render(
    <CharacterList
      rows={[]}
      onOpen={() => {}}
      onOpenRawJson={() => {}}
      onCreate={() => {}}
      onImport={() => {}}
      onClone={() => {}}
      onDelete={() => {}}
      {...extra}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
}

describe('CharacterList menu: install', () => {
  const withInstall = (install: InstallView) => {
    const onInstall = vi.fn();
    list({ install, onInstall });
    return onInstall;
  };

  it("starts the browser's own prompt where there is one", () => {
    const onInstall = withInstall({ kind: 'prompt' });
    fireEvent.click(screen.getByRole('button', { name: 'Install to phone' }));
    expect(onInstall).toHaveBeenCalledOnce();
  });

  it('shows the steps where the browser installs but a page cannot start it', () => {
    const onInstall = withInstall({ kind: 'steps', steps: 'Choose File → Add to Dock.' });
    fireEvent.click(screen.getByRole('button', { name: 'Install to phone' }));
    expect(screen.getByText('Choose File → Add to Dock.')).toBeTruthy();
    expect(onInstall).not.toHaveBeenCalled();
  });

  it.each([{ kind: 'installed' }, { kind: 'unavailable' }] as const)(
    'is absent when $kind',
    (install) => {
      withInstall(install);
      expect(screen.queryByRole('button', { name: 'Install to phone' })).toBeNull();
      // Nor an empty section where it was: no account here, so only import, appearance and legal
      // remain.
      const menu = screen.getByRole('dialog', { name: 'Menu' });
      expect(within(menu).getAllByRole('list')).toHaveLength(3);
    },
  );
});

describe('CharacterList menu: account and cloud', () => {
  it('signed out, offers sign-in and disables Manage cloud', () => {
    const onOpenMenu = vi.fn();
    const onSignIn = vi.fn(() => Promise.resolve(null));
    list({ account: { status: 'signedOut', user: null }, onOpenMenu, onSignIn });
    expect(onOpenMenu).toHaveBeenCalledOnce();
    const manage = screen.getByRole('button', {
      name: 'Manage cloud',
      description: 'Sign in first.',
    });
    expect(manage).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));
    expect(onSignIn).toHaveBeenCalledOnce();
  });

  it('signed in, names the account and opens the cloud', () => {
    const onOpenCloud = vi.fn();
    list({
      account: {
        status: 'signedIn',
        user: { name: 'Dev', email: 'dev@example.com', photoUrl: null },
      },
      onOpenCloud,
    });
    expect(screen.getByText('Dev')).toBeTruthy();
    expect(screen.getByText('dev@example.com')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sign in with Google' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Manage cloud' }));
    expect(onOpenCloud).toHaveBeenCalledOnce();
  });

  it('shows what a failed sign-in said', async () => {
    list({
      account: { status: 'signedOut', user: null },
      onSignIn: () => Promise.resolve('The cloud could not be reached.'),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));
    expect((await screen.findByRole('alert')).textContent).toBe('The cloud could not be reached.');
  });

  it('without a cloud, still offers import', () => {
    const onImport = vi.fn();
    list({ onImport });
    expect(screen.queryByRole('button', { name: 'Manage cloud' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Import from .json' }));
    expect(onImport).toHaveBeenCalledOnce();
  });
});

describe('CharacterList menu: legal', () => {
  it('opens the Privacy Policy and the Terms of Use, with or without a cloud', () => {
    const onOpenLegal = vi.fn();
    list({ onOpenLegal });
    fireEvent.click(screen.getByRole('button', { name: 'Privacy Policy' }));
    expect(onOpenLegal).toHaveBeenLastCalledWith('privacy');
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    fireEvent.click(screen.getByRole('button', { name: 'Terms of Use' }));
    expect(onOpenLegal).toHaveBeenLastCalledWith('terms');
  });

  // The sign-in is where the data is collected, so that is where the terms are named (GDPR Art. 13).
  // A row of its own under Manage cloud, not a menu item: it is a sentence to read, not an action.
  // Kept while signed in too: the terms cover using the backup, not only the moment of sign-in.
  it.each([
    { status: 'signedOut', user: null },
    { status: 'signedIn', user: { name: 'Dev', email: 'dev@example.com', photoUrl: null } },
  ] as const)('names the terms in the account group when $status', (account) => {
    list({ account });
    const note = screen.getByText(/By using cloud backup you accept/);
    expect(within(note).getByRole('link', { name: 'Terms of Use' }).getAttribute('href')).toBe(
      '#/terms',
    );
    expect(within(note).getByRole('link', { name: 'Privacy Policy' }).getAttribute('href')).toBe(
      '#/privacy',
    );
  });

  it('has no cloud note without a cloud', () => {
    list();
    expect(screen.queryByText(/By using cloud backup you accept/)).toBeNull();
  });
});

describe('CharacterList menu: appearance', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  const choice = (name: string) =>
    within(screen.getByRole('radiogroup', { name: 'Appearance' })).getByRole('radio', { name });

  it('follows the device until a theme is chosen', () => {
    list();
    expect((choice('System') as HTMLInputElement).checked).toBe(true);
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('applies the chosen theme at once and remembers it', () => {
    list();
    fireEvent.click(choice('Dark'));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('ui:theme')).toBe('"dark"');

    fireEvent.click(choice('Light'));
    expect(document.documentElement.dataset.theme).toBe('light');

    fireEvent.click(choice('System'));
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(localStorage.getItem('ui:theme')).toBe('"system"');
  });

  it('opens on the remembered theme', () => {
    localStorage.setItem('ui:theme', '"light"');
    list();
    expect((choice('Light') as HTMLInputElement).checked).toBe(true);
  });
});

describe('CharacterList menu: diagnostics', () => {
  const log = (extra: Partial<DiagnosticsView> = {}): DiagnosticsView => ({
    on: false,
    count: 0,
    since: null,
    ...extra,
  });

  it('is absent without a log', () => {
    list();
    expect(screen.queryByRole('button', { name: 'Diagnostics' })).toBeNull();
  });

  it('says what it does while off', () => {
    list({ diagnostics: log() });
    expect(
      screen.getByRole('button', {
        name: 'Diagnostics',
        description: 'Record slow moments for the developer.',
      }),
    ).toBeTruthy();
  });

  it('says how much it holds while on', () => {
    list({ diagnostics: log({ on: true, count: 134 }) });
    expect(
      screen.getByRole('button', { name: 'Diagnostics', description: 'Recording · 134 entries' }),
    ).toBeTruthy();
  });

  it('opens a dialog whose switch, download and clear reach the callbacks', () => {
    const onSetDiagnostics = vi.fn();
    const onDownloadDiagnostics = vi.fn();
    const onClearDiagnostics = vi.fn();
    list({
      diagnostics: log({ count: 3, since: '2026-11-22T17:03:00.000Z' }),
      onSetDiagnostics,
      onDownloadDiagnostics,
      onClearDiagnostics,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Diagnostics' }));
    const dialog = screen.getByRole('dialog', { name: 'Diagnostics' });
    expect(within(dialog).getByText(/^3 entries since /)).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Record slow moments' }));
    expect(onSetDiagnostics).toHaveBeenCalledWith(true);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Download log' }));
    expect(onDownloadDiagnostics).toHaveBeenCalledOnce();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Clear log' }));
    expect(onClearDiagnostics).not.toHaveBeenCalled();
    const confirm = screen.getByRole('dialog', { name: 'Delete?' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete' }));
    expect(onClearDiagnostics).toHaveBeenCalledOnce();
  });

  it('cannot download an empty log, and says it is empty', () => {
    list({ diagnostics: log() });
    fireEvent.click(screen.getByRole('button', { name: 'Diagnostics' }));
    expect(screen.getByRole('button', { name: 'Download log' })).toHaveProperty('disabled', true);
    expect(screen.getByText('Nothing recorded yet.')).toBeTruthy();
  });
});
