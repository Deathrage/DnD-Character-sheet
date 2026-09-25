import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CloudError } from '../data/remote/cloudError.js';
import { decodePayload, type Payload } from '../data/remote/codec.js';
import { createIndexedDbRepository } from '../data/repository/indexedDbRepository.js';
import type {
  CloudCharacter,
  CloudRepository,
  CloudUser,
  CloudVersion,
} from '../data/remote/types.js';
import type { CharacterRepository } from '../data/repository/types.js';
import type { CharacterDocument } from '../data/schema/index.js';
import { ID_A, createOpener, docFor, putRaw, wipe } from '../test/fixtures.js';
import { CharacterLibraryBO } from './characterLibrary.js';
import { CloudBackup } from './cloudBackup.js';
import { StorageGate } from './storageGate.js';

const USER: CloudUser = { uid: 'u1', name: 'Ja', email: 'ja@example.com' };

/**
 * An in-memory cloud with the real one's semantics: a batch lands whole or not at all, and a
 * delete of an absent payload succeeds. `failNext` makes the next call reject, as Firestore would.
 */
function fakeCloud(signedIn = true) {
  const index = new Map<string, Map<string, CloudVersion>>();
  const payloads = new Map<string, Payload>();
  const state = {
    user: signedIn ? USER : null,
    failNext: null as CloudError | null,
    /** A redirect sign-in that just failed: `currentUser` rejects with it once. */
    redirectFailure: null as CloudError | null,
    uploads: 0,
    signIns: 0,
  };
  const check = () => {
    const failure = state.failNext;
    state.failNext = null;
    if (failure) throw failure;
    if (state.user === null) throw new CloudError('SIGNED_OUT');
  };
  const key = (characterId: string, uploadedAt: string) => `${characterId}/${uploadedAt}`;

  const repository: CloudRepository = {
    currentUser: async () => {
      const failure = state.redirectFailure;
      state.redirectFailure = null;
      if (failure) throw failure;
      return state.user;
    },
    signIn: async () => {
      state.signIns += 1;
      const failure = state.failNext;
      state.failNext = null;
      if (failure) throw failure;
      state.user = USER;
      return USER;
    },
    signOut: async () => {
      state.user = null;
    },
    listCharacters: async (): Promise<CloudCharacter[]> => {
      check();
      // An emptied index is hidden, as the real one hides it (spec §12).
      return [...index]
        .filter(([, versions]) => versions.size > 0)
        .map(([characterId, versions]) => ({
          characterId,
          versions: [...versions.values()].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)),
        }));
    },
    upload: async (characterId, version, payload) => {
      check();
      state.uploads += 1;
      payloads.set(key(characterId, version.uploadedAt), payload);
      const versions = index.get(characterId) ?? new Map<string, CloudVersion>();
      versions.set(version.uploadedAt, version);
      index.set(characterId, versions);
    },
    getPayload: async (characterId, uploadedAt) => {
      check();
      return payloads.get(key(characterId, uploadedAt)) ?? null;
    },
    deleteVersion: async (characterId, uploadedAt) => {
      check();
      payloads.delete(key(characterId, uploadedAt));
      index.get(characterId)?.delete(uploadedAt);
    },
    deleteCharacter: async (characterId, uploadedAts) => {
      check();
      for (const uploadedAt of uploadedAts) payloads.delete(key(characterId, uploadedAt));
      index.delete(characterId);
    },
  };
  return { repository, state, index, payloads };
}

/** Advances a millisecond per call, so two uploads never share an `uploadedAt`. */
function clock(start = Date.parse('2026-09-24T18:00:00.000Z')) {
  let now = start;
  return () => new Date(now++);
}

describe('CloudBackup', () => {
  let repository: CharacterRepository;
  let library: CharacterLibraryBO;

  beforeEach(async () => {
    await wipe();
    repository = createIndexedDbRepository({ openDb: createOpener() });
    library = new CharacterLibraryBO({
      repository,
      storageGate: new StorageGate({ port: null }),
      // A debounce long enough that only `flush()` can land an edit before the upload reads it.
      autosave: { debounceMs: 60_000, target: null },
    });
    await repository.save(docFor(ID_A, 'Sable'));
    await library.load();
  });
  afterEach(wipe);

  function backup(cloud = fakeCloud()) {
    return {
      cloud,
      backup: new CloudBackup(library, { load: async () => cloud.repository, now: clock() }),
    };
  }

  it('loads nothing on construction, and its status is unknown until something checks', () => {
    let loads = 0;
    const cloudBackup = new CloudBackup(library, {
      load: async () => {
        loads += 1;
        return fakeCloud().repository;
      },
    });
    expect(loads).toBe(0);
    expect(cloudBackup.status).toBe('unknown');
  });

  it('checkSignIn settles the status, and does not ask again once it is known', async () => {
    const { backup: cloudBackup, cloud } = backup();
    let checks = 0;
    const { currentUser } = cloud.repository;
    cloud.repository.currentUser = () => {
      checks += 1;
      return currentUser();
    };

    await cloudBackup.checkSignIn();
    expect(cloudBackup.status).toBe('signedIn');
    await cloudBackup.checkSignIn();
    expect(checks).toBe(1);
  });

  it('checkSignIn reports a signed-out player as signed out', async () => {
    const { backup: cloudBackup } = backup(fakeCloud(false));
    await cloudBackup.checkSignIn();
    expect(cloudBackup.status).toBe('signedOut');
  });

  it('uploads one version: one index entry and one payload', async () => {
    const { backup: cloudBackup, cloud } = backup();

    const result = await cloudBackup.upload(ID_A);

    expect(result).toEqual({ ok: true, uploadedAt: '2026-09-24T18:00:00.000Z' });
    expect(cloud.index.get(ID_A)?.size).toBe(1);
    expect(cloud.payloads.size).toBe(1);
    expect(cloudBackup.characters).toEqual([
      {
        characterId: ID_A,
        versions: [
          expect.objectContaining({ name: 'Sable', totalLevel: 0, schemaVersion: 1 }) as unknown,
        ],
      },
    ]);
    expect(cloudBackup.lastUpload).toEqual({ characterId: ID_A, result });
  });

  it('uploads the edit made a moment ago, not the last autosaved copy', async () => {
    const opened = await library.entries[0]!.open();
    if (!opened.ok) throw new Error(opened.message);
    opened.sheet.setName('Sable Nightwind'); // inside the 60 s debounce: not yet stored
    const { backup: cloudBackup, cloud } = backup();

    await cloudBackup.upload(ID_A);

    const payload = [...cloud.payloads.values()][0]!;
    const decoded = await decodePayload(payload, ID_A);
    expect(decoded.ok && decoded.doc.name).toBe('Sable Nightwind');
    opened.sheet.dispose();
  });

  it('uploads once when Upload is pressed twice quickly', async () => {
    const { backup: cloudBackup, cloud } = backup();

    const [first, second] = await Promise.all([cloudBackup.upload(ID_A), cloudBackup.upload(ID_A)]);

    expect(cloud.state.uploads).toBe(1);
    expect(first.ok).toBe(true);
    expect(second).toEqual({ ok: false, message: 'Wait for the current cloud action to finish.' });
  });

  it('refuses to upload a damaged character', async () => {
    await putRaw(ID_A, { not: 'a character' });
    const { backup: cloudBackup, cloud } = backup();
    const result = await cloudBackup.upload(ID_A);
    expect(result.ok).toBe(false);
    expect(cloud.state.uploads).toBe(0);
  });

  it('refuses to upload when signed out, and never starts a sign-in itself', async () => {
    const { backup: cloudBackup, cloud } = backup(fakeCloud(false));

    expect(await cloudBackup.upload(ID_A)).toEqual({
      ok: false,
      message: 'Sign in with Google to use cloud backup.',
    });
    expect(cloud.state.signIns).toBe(0);
    expect(cloud.state.uploads).toBe(0);
  });

  it('reports a Firebase that will not load as unavailable, without rejecting', async () => {
    const cloudBackup = new CloudBackup(library, {
      load: () => Promise.reject(new TypeError('Failed to fetch dynamically imported module')),
    });

    await expect(cloudBackup.refresh()).resolves.toBe(
      'Cloud backup could not be loaded. Check your connection and try again.',
    );
    expect(cloudBackup.status).toBe('unavailable');
    await expect(cloudBackup.upload(ID_A)).resolves.toMatchObject({ ok: false });
  });

  it('reports a failed redirect sign-in once, as signed out rather than unavailable', async () => {
    const { backup: cloudBackup, cloud } = backup(fakeCloud(false));
    cloud.state.redirectFailure = new CloudError('CANCELLED');

    await expect(cloudBackup.refresh()).resolves.toBe('Sign-in was cancelled.');
    expect(cloudBackup.status).toBe('signedOut');
    await expect(cloudBackup.refresh()).resolves.toBeNull();
  });

  it('turns a quota failure into a sentence', async () => {
    const { backup: cloudBackup, cloud } = backup();
    await cloudBackup.refresh();
    cloud.state.failNext = new CloudError('QUOTA');
    expect(await cloudBackup.upload(ID_A)).toEqual({
      ok: false,
      message: 'Cloud backup is out of free capacity for today. Try again tomorrow.',
    });
  });

  it('restores into an empty browser under the same id, with no dialog', async () => {
    const { backup: cloudBackup } = backup();
    const { uploadedAt } = (await cloudBackup.upload(ID_A)) as { uploadedAt: string };
    await library.entries[0]!.remove();

    expect(await cloudBackup.restore(ID_A, uploadedAt)).toEqual({ ok: true, id: ID_A });
    expect(library.entries.map((entry) => entry.id)).toEqual([ID_A]);
  });

  it('asks when the character is already here, then Replace keeps the id', async () => {
    const { backup: cloudBackup } = backup();
    const { uploadedAt } = (await cloudBackup.upload(ID_A)) as { uploadedAt: string };

    const asked = await cloudBackup.restore(ID_A, uploadedAt);
    expect(asked).toEqual({
      ok: false,
      kind: 'conflict',
      name: 'Sable',
      localUpdatedAt: '2026-07-25T09:41:00.000Z',
      incomingUpdatedAt: '2026-07-25T09:41:00.000Z',
    });

    expect(await cloudBackup.restore(ID_A, uploadedAt, 'replace')).toEqual({ ok: true, id: ID_A });
    expect(library.entries).toHaveLength(1);
  });

  it('Replace writes the cloud version over the stored local copy', async () => {
    const { backup: cloudBackup } = backup();
    const { uploadedAt } = (await cloudBackup.upload(ID_A)) as { uploadedAt: string };
    await repository.save(docFor(ID_A, 'Edited locally'));
    await library.load();

    expect(await cloudBackup.restore(ID_A, uploadedAt, 'replace')).toEqual({ ok: true, id: ID_A });

    const stored = await repository.get(ID_A);
    expect(stored?.ok && stored.doc.name).toBe('Sable');
  });

  it('Keep both stores a copy under a new id', async () => {
    const { backup: cloudBackup } = backup();
    const { uploadedAt } = (await cloudBackup.upload(ID_A)) as { uploadedAt: string };

    const result = await cloudBackup.restore(ID_A, uploadedAt, 'keepBoth');

    expect(result.ok && result.id).not.toBe(ID_A);
    expect(library.entries).toHaveLength(2);
  });

  it('offers to replace a damaged local copy, and shows it as damaged', async () => {
    const { backup: cloudBackup } = backup();
    const { uploadedAt } = (await cloudBackup.upload(ID_A)) as { uploadedAt: string };
    await putRaw(ID_A, { not: 'a character' });
    await library.load();

    expect(await cloudBackup.restore(ID_A, uploadedAt)).toMatchObject({
      kind: 'conflict',
      localUpdatedAt: null,
    });
    await cloudBackup.restore(ID_A, uploadedAt, 'replace');
    expect(library.entries[0]?.isDamaged).toBe(false);
  });

  it('asks before overwriting a stored character that the list does not show', async () => {
    // A load that failed, or another tab that stored it since: the list is empty, the store is not.
    const unloaded = new CharacterLibraryBO({
      repository,
      storageGate: new StorageGate({ port: null }),
      autosave: { debounceMs: 60_000, target: null },
    });
    const cloudBackup = new CloudBackup(unloaded, {
      load: async () => fakeCloud().repository,
      now: clock(),
    });
    const { uploadedAt } = (await cloudBackup.upload(ID_A)) as { uploadedAt: string };
    await repository.save(docFor(ID_A, 'Edited in another tab'));
    expect(unloaded.entries).toEqual([]);

    expect(await cloudBackup.restore(ID_A, uploadedAt)).toMatchObject({
      ok: false,
      kind: 'conflict',
      name: 'Edited in another tab',
    });
    const stored = await repository.get(ID_A);
    expect(stored?.ok && stored.doc.name).toBe('Edited in another tab');
  });

  it('answers a local read that fails during a restore, rather than rejecting', async () => {
    const { backup: cloudBackup, cloud } = backup();
    const { uploadedAt } = (await cloudBackup.upload(ID_A)) as { uploadedAt: string };
    const broken = new CharacterLibraryBO({
      repository: { ...repository, get: () => Promise.reject(new Error('IndexedDB is blocked')) },
      storageGate: new StorageGate({ port: null }),
      autosave: { debounceMs: 60_000, target: null },
    });
    await broken.load();
    const brokenBackup = new CloudBackup(broken, {
      load: async () => cloud.repository,
      now: clock(),
    });
    await brokenBackup.refresh();

    await expect(brokenBackup.restore(ID_A, uploadedAt)).resolves.toMatchObject({
      ok: false,
      kind: 'failed',
    });
  });

  it('refuses Replace while the sheet is open', async () => {
    const { backup: cloudBackup } = backup();
    const { uploadedAt } = (await cloudBackup.upload(ID_A)) as { uploadedAt: string };
    const opened = await library.entries[0]!.open();
    if (!opened.ok) throw new Error(opened.message);

    expect(await cloudBackup.restore(ID_A, uploadedAt, 'replace')).toEqual({
      ok: false,
      kind: 'failed',
      message: "Close this character's sheet before replacing it.",
    });
    opened.sheet.dispose();
  });

  it('reports a version from a newer app and stores nothing', async () => {
    const { backup: cloudBackup, cloud } = backup();
    const { uploadedAt } = (await cloudBackup.upload(ID_A)) as { uploadedAt: string };
    const { encodePayload } = await import('../data/remote/codec.js');
    cloud.payloads.set(
      `${ID_A}/${uploadedAt}`,
      // `schemaVersion` is the literal `1` in the type, so a newer version needs the cast.
      await encodePayload(
        { ...docFor(ID_A, 'Future'), schemaVersion: 99 } as unknown as CharacterDocument,
        null,
      ),
    );
    await library.entries[0]!.remove();

    const result = await cloudBackup.restore(ID_A, uploadedAt);

    expect(result).toMatchObject({
      ok: false,
      kind: 'failed',
      message: expect.stringMatching(/newer version/) as unknown,
    });
    expect(library.entries).toEqual([]);
  });

  it('deleting the last version removes the character from the cloud', async () => {
    const { backup: cloudBackup, cloud } = backup();
    const { uploadedAt } = (await cloudBackup.upload(ID_A)) as { uploadedAt: string };

    expect(await cloudBackup.deleteVersion(ID_A, uploadedAt)).toBeNull();

    expect(cloud.payloads.size).toBe(0);
    expect(cloudBackup.characters).toEqual([]);
    // The emptied index stays behind, hidden from every later list.
    expect(await cloudBackup.refresh()).toBeNull();
    expect(cloudBackup.characters).toEqual([]);
  });

  it('deleting the last version this list knows of keeps one another device uploaded since', async () => {
    const cloud = fakeCloud();
    const { backup: here } = backup(cloud);
    const { uploadedAt } = (await here.upload(ID_A)) as { uploadedAt: string };
    const elsewhere = new CloudBackup(library, {
      load: async () => cloud.repository,
      now: clock(Date.parse('2026-09-25T18:00:00.000Z')),
    });
    const other = (await elsewhere.upload(ID_A)) as { uploadedAt: string };

    expect(await here.deleteVersion(ID_A, uploadedAt)).toBeNull();

    expect([...(cloud.index.get(ID_A)?.keys() ?? [])]).toEqual([other.uploadedAt]);
    expect(cloud.payloads.has(`${ID_A}/${other.uploadedAt}`)).toBe(true);
  });

  it('deleting one of several versions keeps the others', async () => {
    const { backup: cloudBackup, cloud } = backup();
    const first = (await cloudBackup.upload(ID_A)) as { uploadedAt: string };
    await cloudBackup.upload(ID_A);

    await cloudBackup.deleteVersion(ID_A, first.uploadedAt);

    expect(cloud.index.get(ID_A)?.size).toBe(1);
    expect(cloudBackup.characters[0]?.versions).toHaveLength(1);
  });

  it('a character delete that fails can be retried, and keeps its row until it succeeds', async () => {
    const { backup: cloudBackup, cloud } = backup();
    await cloudBackup.upload(ID_A);
    await cloudBackup.upload(ID_A);
    cloud.state.failNext = new CloudError('OFFLINE');

    expect(await cloudBackup.deleteCharacter(ID_A)).toMatch(/connection/);
    expect(cloudBackup.characters).toHaveLength(1);

    expect(await cloudBackup.deleteCharacter(ID_A)).toBeNull();
    expect(cloudBackup.characters).toEqual([]);
    expect(cloud.payloads.size).toBe(0);
  });

  it('adds up the usage', async () => {
    const { backup: cloudBackup } = backup();
    await cloudBackup.upload(ID_A);
    await cloudBackup.upload(ID_A);
    const sizes = cloudBackup.characters[0]!.versions.map((version) => version.bytes);
    expect(cloudBackup.totalBytes).toBe(sizes[0]! + sizes[1]!);
  });

  it('signing out forgets the list, so the next person at this device does not see it', async () => {
    const { backup: cloudBackup } = backup();
    await cloudBackup.upload(ID_A);

    await cloudBackup.signOut();

    expect(cloudBackup.status).toBe('signedOut');
    expect(cloudBackup.user).toBeNull();
    expect(cloudBackup.characters).toEqual([]);
  });
});
