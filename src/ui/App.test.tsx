// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  CharacterLibraryBO,
  CloudBackup,
  StorageGate,
  type PersistencePort,
} from '../business/index.js';
import { ID_A, docFor, putRaw, wipe } from '../test/fixtures.js';
import { stubDialogElement } from '../test/stubDialog.js';
import { App } from './App.js';

/**
 * The shell over a real `CharacterLibraryBO` on `fake-indexeddb`, driven through the rendered UI.
 * These are the only tests that cover the whole stack at once — a tap reaching the store, and a
 * stored document reaching the screen — so a seam that quietly stopped being wired shows up here
 * and nowhere else.
 */
const port = (overrides: Partial<PersistencePort> = {}): PersistencePort => ({
  persisted: () => Promise.resolve(true),
  persist: () => Promise.resolve(true),
  ...overrides,
});

/** `CloudBackup`'s injectable loader, named through the class: `src/ui` may not import `src/data`. */
type CloudLoad = NonNullable<NonNullable<ConstructorParameters<typeof CloudBackup>[1]>['load']>;

/**
 * Only the sign-in check, which is all a sheet asks of the cloud before a press. Any other call
 * would be a bug in the test, so the rest of the interface is left out and cast.
 */
const cloudWith =
  (signedIn: boolean): CloudLoad =>
  () =>
    Promise.resolve({
      currentUser: () =>
        Promise.resolve(signedIn ? { uid: 'u1', name: 'Ja', email: 'ja@example.com' } : null),
    } as unknown as Awaited<ReturnType<CloudLoad>>);

function renderApp(
  gatePort: PersistencePort = port(),
  load: CloudLoad = () => Promise.reject(new Error('no cloud in the shell tests')),
) {
  const library = new CharacterLibraryBO({
    storageGate: new StorageGate({ port: gatePort }),
    autosave: { debounceMs: 0, target: null },
  });
  const cloud = new CloudBackup(library, { load });
  return { library, ...render(<App library={library} cloud={cloud} />) };
}

const HINT = 'Sign in with your Google account from the Characters menu to upload.';

beforeAll(stubDialogElement);

describe('App', () => {
  beforeEach(async () => {
    globalThis.location.hash = '';
    await wipe();
  });
  afterEach(wipe);

  it('lists nothing on a first run', async () => {
    renderApp();
    expect(await screen.findByText('No characters yet. Tap + to make one.')).toBeDefined();
  });

  it('sends a signed-out player from the cloud page back to the characters', async () => {
    globalThis.location.hash = '#/cloud';
    renderApp(port(), cloudWith(false));
    expect(await screen.findByText('No characters yet. Tap + to make one.')).toBeDefined();
    expect(globalThis.location.hash).toBe('#/');
    expect(screen.queryByRole('button', { name: 'Sign in with Google' })).toBeNull();
  });

  it('shows only the error on the cloud page when the cloud cannot be reached', async () => {
    globalThis.location.hash = '#/cloud';
    renderApp();
    expect(
      await screen.findByText(
        'Cloud backup could not be loaded. Check your connection and try again.',
      ),
    ).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Sign in with Google' })).toBeNull();
  });

  it('creates a character, opens it, and stores what is typed into it', async () => {
    const { library } = renderApp();
    await screen.findByText('No characters yet. Tap + to make one.');

    fireEvent.click(screen.getByLabelText('New character'));

    // Created, opened, and the route followed it.
    await waitFor(() => expect(screen.getByLabelText('Armor class')).toBeDefined());
    expect(globalThis.location.hash).toMatch(/^#\/c\//);

    fireEvent.change(screen.getByLabelText('Armor class'), { target: { value: '15' } });

    const id = library.entries[0]?.id ?? '';
    await waitFor(async () => {
      const opened = await library.entries[0]?.open();
      expect(opened?.ok === true && opened.sheet.armorClass).toBe(15);
      if (opened?.ok === true) opened.sheet.dispose();
    });
    expect(id).not.toBe('');
  });

  it.each([
    { signedIn: false, disabled: true },
    { signedIn: true, disabled: false },
  ])(
    'an open sheet checks sign-in, and Upload is disabled only when signed out ($signedIn)',
    async ({ signedIn, disabled }) => {
      renderApp(port(), cloudWith(signedIn));
      await screen.findByText('No characters yet. Tap + to make one.');
      fireEvent.click(screen.getByLabelText('New character'));

      const upload = await screen.findByRole('button', { name: 'Upload to cloud' });
      // Both at once: until the sign-in check settles, Upload is disabled and the hint hidden, so
      // waiting on the hint alone lets the signed-in case assert before the button is enabled.
      await waitFor(() => {
        expect(screen.queryByText(HINT) !== null).toBe(disabled);
        expect((upload as HTMLButtonElement).disabled).toBe(disabled);
      });
    },
  );

  it('asks before importing a character that is already here, and Keep both adds "(restored)"', async () => {
    await putRaw(ID_A, docFor(ID_A, 'Sable'));
    const { library, container } = renderApp();
    await screen.findByText('Sable');

    const picker = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File([JSON.stringify(docFor(ID_A, 'Sable'))], 'sable.json');
    Object.defineProperty(picker, 'files', { value: [file], configurable: true });
    fireEvent.change(picker);

    expect(await screen.findByText(/Sable is already in this app/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Keep both' }));

    // Listed, not opened: the player stays on the list.
    expect(await screen.findByText('Sable (restored)')).toBeDefined();
    expect(library.entries.map((entry) => entry.name)).toEqual(['Sable', 'Sable (restored)']);
    expect(globalThis.location.hash).toBe('');
  });

  it('routes into a section and back out again', async () => {
    renderApp();
    await screen.findByText('No characters yet. Tap + to make one.');
    fireEvent.click(screen.getByLabelText('New character'));
    await waitFor(() => expect(screen.getByLabelText('Armor class')).toBeDefined());

    fireEvent.click(screen.getByText('Feats & Traits'));

    await waitFor(() => expect(globalThis.location.hash).toMatch(/\/feats$/));
    // The vitals header stays pinned above an open section.
    expect(screen.getByLabelText('Armor class')).toBeDefined();
  });

  it('lists a damaged character and opens it in the raw editor', async () => {
    await putRaw(ID_A, { schemaVersion: 99, id: ID_A, name: 'Half a character' });
    renderApp();

    expect(await screen.findByText('Damaged character')).toBeDefined();
    fireEvent.click(screen.getByText('Damaged character'));

    const area = await screen.findByLabelText('Character JSON');
    // Criterion 15: the raw stored text, not a repaired or defaulted version of it.
    expect((area as HTMLTextAreaElement).value).toContain('"schemaVersion": 99');
  });

  it('clones a character into a new row only once the player confirms', async () => {
    await putRaw(ID_A, docFor(ID_A, 'Sable'));
    const { library } = renderApp();

    fireEvent.click(await screen.findByLabelText('Clone Sable'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();

    fireEvent.click(screen.getByLabelText('Clone Sable'));
    fireEvent.click(screen.getByRole('button', { name: 'Clone' }));

    await waitFor(() => expect(library.entries).toHaveLength(2));
    // A clone is asynchronous, so a cancelled one would only show up after a pause: count again
    // once everything has settled, not straight after the Cancel.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(library.entries.map((entry) => entry.name)).toEqual(['Sable', 'Sable (copy)']);
  });

  it('deletes a character only once the player confirms', async () => {
    await putRaw(ID_A, docFor(ID_A, 'Sable'));
    const { library } = renderApp();

    fireEvent.click(await screen.findByLabelText('Delete Sable'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    expect(library.entries).toHaveLength(1);

    fireEvent.click(screen.getByLabelText('Delete Sable'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText('No characters yet. Tap + to make one.')).toBeDefined();
  });

  it('refuses a repair that is not valid JSON and keeps the text', async () => {
    await putRaw(ID_A, { schemaVersion: 99, id: ID_A });
    renderApp();
    fireEvent.click(await screen.findByText('Damaged character'));
    const area = await screen.findByLabelText('Character JSON');

    fireEvent.change(area, { target: { value: '{ "name": ' } });
    fireEvent.click(screen.getByText('Commit'));

    expect(await screen.findByRole('alert')).toBeDefined();
    // The draft is often the only copy of the fix, so a rejected commit must not clear it.
    expect((area as HTMLTextAreaElement).value).toBe('{ "name": ');
  });

  it('blocks the list with the gate until persistence is granted', async () => {
    const { library } = renderApp(
      port({ persisted: () => Promise.resolve(false), persist: () => Promise.resolve(true) }),
    );

    expect(await screen.findByText('Your characters are not safe here yet')).toBeDefined();

    fireEvent.click(screen.getByText('Make storage permanent'));

    await waitFor(() =>
      expect(screen.queryByText('Your characters are not safe here yet')).toBeNull(),
    );
    expect(library.storageGate.persistence).toBe('granted');
  });

  it('offers a session-only escape once a request has been refused', async () => {
    renderApp(
      port({ persisted: () => Promise.resolve(false), persist: () => Promise.resolve(false) }),
    );
    await screen.findByText('Your characters are not safe here yet');

    fireEvent.click(screen.getByText('Make storage permanent'));

    // First-run denial is the likely outcome in Chrome, so the gate must not become a trap.
    const escape = await screen.findByText('Continue anyway, my data may be lost');
    fireEvent.click(escape);
    await waitFor(() =>
      expect(screen.queryByText('Your characters are not safe here yet')).toBeNull(),
    );
  });
});
