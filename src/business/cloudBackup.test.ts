import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CloudError } from '../data/remote/cloudError.js';
import {
  cloudDocumentPath,
  cloudDocumentSize,
  withoutVersions,
  withVersion,
} from '../data/remote/cloudDocument.js';
import { decodePayload, encodePayload } from '../data/remote/codec.js';
import { parseCloudDocument, type CloudDocument } from '../data/remote/layout/index.js';
import { documentSize, MAX_DOCUMENT_BYTES } from '../data/remote/size.js';
import type { CloudLoad, CloudRepository, CloudUser } from '../data/remote/types.js';
import { createIndexedDbRepository } from '../data/repository/indexedDbRepository.js';
import type { CharacterRepository } from '../data/repository/types.js';
import type { CharacterDocument } from '../data/schema/index.js';
import { ID_A, ID_B, createOpener, docFor, putRaw, wipe } from '../test/fixtures.js';
import { CharacterLibraryBO } from './characterLibrary.js';
import { CloudBackup } from './cloudBackup.js';
import { StorageGate } from './storageGate.js';

const USER: CloudUser = { uid: 'u1', name: 'Ja', email: 'ja@example.com' };

const OTHER: CloudUser = { uid: 'u2', name: 'Other', email: 'other@example.com' };

/** The only top-level fields `firestore.rules` accepts. */
const RULES_KEYS = ['layoutVersion', 'portraits', 'characters'];

const isMap = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !(value instanceof Uint8Array);

/** Firestore's `setDoc(…, { merge: true })`: maps merge key by key, anything else is replaced. */
function merged(base: unknown, patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = isMap(base) ? { ...base } : {};
  for (const [key, value] of Object.entries(patch)) {
    out[key] = isMap(value) ? merged(out[key], value) : value;
  }
  return out;
}

/**
 * An in-memory cloud. It holds each account's raw document, as Firestore would, and parses it with
 * the real layout. `failNext` makes the next call reject, as Firestore would. Like the rules, it
 * refuses any uid but the signed-in one's.
 */
function fakeCloud(signedIn = true) {
  const state = {
    user: signedIn ? USER : null,
    failNext: null as unknown,
    /** A redirect sign-in that just failed: `currentUser` rejects with it once. */
    redirectFailure: null as CloudError | null,
    /** Each account's document as Firestore holds it; absent until its first upload. */
    docs: {} as Record<string, unknown>,
    /** `USER`'s document. */
    get stored(): unknown {
      return this.docs[USER.uid];
    },
    set stored(value: unknown) {
      this.docs[USER.uid] = value;
    },
    uploads: 0,
    loads: 0,
    signIns: 0,
  };
  const check = (uid: string) => {
    const failure = state.failNext;
    state.failNext = null;
    if (failure) throw failure;
    if (state.user === null) throw new CloudError('SIGNED_OUT');
    if (state.user.uid !== uid) throw new CloudError('PERMISSION_DENIED');
  };
  const read = (uid: string): CloudLoad => {
    if (state.docs[uid] === undefined) return { ok: true, doc: null };
    const parsed = parseCloudDocument(state.docs[uid]);
    return parsed.ok ? { ok: true, doc: parsed.value } : { ok: false, error: parsed.error };
  };

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
    load: async (uid) => {
      check(uid);
      state.loads += 1;
      return read(uid);
    },
    upload: async (uid, characterId, uploadedAt, version) => {
      check(uid);
      const stored = state.docs[uid] as Record<string, unknown> | undefined;
      // The rules refuse a write over any other layout, such as a newer one.
      if (stored !== undefined && stored.layoutVersion !== 2) {
        throw new CloudError('PERMISSION_DENIED');
      }
      const current = read(uid);
      // A layout-2 document this build cannot parse is still merged into, as Firestore does.
      const after = current.ok
        ? withVersion(current.doc, characterId, uploadedAt, version)
        : merged(stored, withVersion(null, characterId, uploadedAt, version));
      if (!Object.keys(after).every((key) => RULES_KEYS.includes(key))) {
        throw new CloudError('PERMISSION_DENIED');
      }
      if (documentSize(cloudDocumentPath(uid), after) > MAX_DOCUMENT_BYTES) {
        // What the emulator answers (spec §5); production's code may differ, which is the point.
        throw Object.assign(new Error('maximum entity size is 1048576 bytes'), {
          code: 'failed-precondition',
        });
      }
      state.uploads += 1;
      state.docs[uid] = after;
    },
    deleteVersions: async (uid, characterId, uploadedAts) => {
      check(uid);
      const current = read(uid);
      if (!current.ok || current.doc === null) return current;
      const { doc } = withoutVersions(current.doc, characterId, uploadedAts);
      state.docs[uid] = doc;
      return { ok: true, doc };
    },
  };
  return { repository, state };
}

/** Advances a millisecond per call, so two uploads never share an `uploadedAt`. */
function clock(start = Date.parse('2026-09-24T18:00:00.000Z')) {
  let now = start;
  return () => new Date(now++);
}

/** Lists first, as the cloud screen does, so an upload lands in the list. */
async function uploaded(cloudBackup: CloudBackup, id = ID_A): Promise<string> {
  await cloudBackup.refresh();
  const result = await cloudBackup.upload(id);
  if (!result.ok) throw new Error(result.message);
  return result.uploadedAt;
}

const PORTRAIT = `data:image/jpeg;base64,${btoa('\xff\xd8\xff\xe0 not really a jpeg \xff\xd9')}`;
const AT = '2026-09-25T10:00:00.000Z';

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
    await cloudBackup.refresh();

    const result = await cloudBackup.upload(ID_A);

    expect(result).toEqual({ ok: true, uploadedAt: '2026-09-24T18:00:00.000Z' });
    expect(Object.keys((cloud.state.stored as CloudDocument).characters[ID_A]!)).toHaveLength(1);
    expect(cloudBackup.characters[0]?.versions[0]?.sheet).toMatchObject({
      name: 'Sable',
      totalLevel: 0,
    });
    expect(cloudBackup.lastUpload).toEqual({ characterId: ID_A, result });
  });

  it('uploads the edit made a moment ago, not the last autosaved copy', async () => {
    const opened = await library.entries[0]!.open();
    if (!opened.ok) throw new Error(opened.message);
    opened.sheet.setName('Sable Nightwind'); // inside the 60 s debounce: not yet stored
    const { backup: cloudBackup, cloud } = backup();

    const result = (await cloudBackup.upload(ID_A)) as { uploadedAt: string };

    const { sheet } = (cloud.state.stored as CloudDocument).characters[ID_A]![result.uploadedAt]!;
    const decoded = await decodePayload({ sheet, portrait: null }, ID_A);
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
    const uploadedAt = await uploaded(cloudBackup);
    await library.entries[0]!.remove();

    expect(await cloudBackup.restore(ID_A, uploadedAt)).toEqual({ ok: true, id: ID_A });
    expect(library.entries.map((entry) => entry.id)).toEqual([ID_A]);
  });

  it('asks when the character is already here, then Replace keeps the id', async () => {
    const { backup: cloudBackup } = backup();
    const uploadedAt = await uploaded(cloudBackup);

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
    const uploadedAt = await uploaded(cloudBackup);
    await repository.save(docFor(ID_A, 'Edited locally'));
    await library.load();

    expect(await cloudBackup.restore(ID_A, uploadedAt, 'replace')).toEqual({ ok: true, id: ID_A });

    const stored = await repository.get(ID_A);
    expect(stored?.ok && stored.doc.name).toBe('Sable');
  });

  it('Keep both stores a copy under a new id', async () => {
    const { backup: cloudBackup } = backup();
    const uploadedAt = await uploaded(cloudBackup);

    const result = await cloudBackup.restore(ID_A, uploadedAt, 'keepBoth');

    expect(result.ok && result.id).not.toBe(ID_A);
    expect(library.entries).toHaveLength(2);
  });

  it('offers to replace a damaged local copy, and shows it as damaged', async () => {
    const { backup: cloudBackup } = backup();
    const uploadedAt = await uploaded(cloudBackup);
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
    const uploadedAt = await uploaded(cloudBackup);
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
    const uploadedAt = await uploaded(cloudBackup);
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
    const uploadedAt = await uploaded(cloudBackup);
    const opened = await library.entries[0]!.open();
    if (!opened.ok) throw new Error(opened.message);

    expect(await cloudBackup.restore(ID_A, uploadedAt, 'replace')).toEqual({
      ok: false,
      kind: 'failed',
      message: "Close this character's sheet before replacing it.",
    });
    opened.sheet.dispose();
  });

  it('lists a version from a newer app flagged, and refuses to restore it', async () => {
    const { backup: cloudBackup, cloud } = backup();
    const future = await encodePayload(
      { ...docFor(ID_A, 'Future'), schemaVersion: 99 } as unknown as CharacterDocument,
      null,
    );
    cloud.state.stored = {
      layoutVersion: 2,
      characters: { [ID_A]: { [AT]: { sheet: future.sheet, portrait: null } } },
    };
    await library.entries[0]!.remove();

    expect(await cloudBackup.refresh()).toBeNull();
    const version = cloudBackup.characters[0]!.versions[0]!;
    expect(version).toMatchObject({ sheet: null, fromNewerApp: true });
    expect(version.problem).toMatch(/newer version/);
    expect(await cloudBackup.restore(ID_A, AT)).toMatchObject({ ok: false, kind: 'failed' });
    expect(library.entries).toEqual([]);
  });

  it('deleting the last version removes the character from the cloud', async () => {
    const { backup: cloudBackup, cloud } = backup();
    const uploadedAt = await uploaded(cloudBackup);

    expect(await cloudBackup.deleteVersion(ID_A, uploadedAt)).toBeNull();

    expect((cloud.state.stored as CloudDocument).characters).toEqual({});
    expect(cloudBackup.characters).toEqual([]);
    expect(await cloudBackup.refresh()).toBeNull();
    expect(cloudBackup.characters).toEqual([]);
  });

  it('deleting the last version this list knows of keeps one another device uploaded since', async () => {
    const cloud = fakeCloud();
    const { backup: here } = backup(cloud);
    await here.refresh();
    const { uploadedAt } = (await here.upload(ID_A)) as { uploadedAt: string };
    const elsewhere = new CloudBackup(library, {
      load: async () => cloud.repository,
      now: clock(Date.parse('2026-09-25T18:00:00.000Z')),
    });
    const other = (await elsewhere.upload(ID_A)) as { uploadedAt: string };

    expect(await here.deleteVersion(ID_A, uploadedAt)).toBeNull();

    expect(Object.keys((cloud.state.stored as CloudDocument).characters[ID_A]!)).toEqual([
      other.uploadedAt,
    ]);
  });

  it('deleting one of several versions keeps the others', async () => {
    const { backup: cloudBackup, cloud } = backup();
    const first = await uploaded(cloudBackup);
    await cloudBackup.upload(ID_A);

    await cloudBackup.deleteVersion(ID_A, first);

    expect(Object.keys((cloud.state.stored as CloudDocument).characters[ID_A]!)).toHaveLength(1);
    expect(cloudBackup.characters[0]?.versions).toHaveLength(1);
  });

  it('a character delete that fails can be retried, and keeps its row until it succeeds', async () => {
    const { backup: cloudBackup, cloud } = backup();
    await uploaded(cloudBackup);
    await cloudBackup.upload(ID_A);
    cloud.state.failNext = new CloudError('OFFLINE');

    expect(await cloudBackup.deleteCharacter(ID_A)).toMatch(/connection/);
    expect(cloudBackup.characters).toHaveLength(1);

    expect(await cloudBackup.deleteCharacter(ID_A)).toBeNull();
    expect(cloudBackup.characters).toEqual([]);
    expect((cloud.state.stored as CloudDocument).characters).toEqual({});
  });

  it('shows usage as the cloud document’s size, out of 1 MiB', async () => {
    const { backup: cloudBackup, cloud } = backup();
    await uploaded(cloudBackup);
    await cloudBackup.upload(ID_A);
    expect(cloudBackup.limitBytes).toBe(1_048_576);
    expect(cloudBackup.usedBytes).toBe(
      cloudDocumentSize(USER.uid, cloud.state.stored as CloudDocument),
    );
    const [first] = cloudBackup.characters[0]!.versions;
    await cloudBackup.deleteVersion(ID_A, first!.uploadedAt);
    expect(cloudBackup.usedBytes).toBe(
      cloudDocumentSize(USER.uid, cloud.state.stored as CloudDocument),
    );
  });

  it('signing out forgets the list, so the next person at this device does not see it', async () => {
    const { backup: cloudBackup } = backup();
    await uploaded(cloudBackup);
    expect(cloudBackup.characters).not.toEqual([]);

    await cloudBackup.signOut();

    expect(cloudBackup.status).toBe('signedOut');
    expect(cloudBackup.user).toBeNull();
    expect(cloudBackup.characters).toEqual([]);
  });

  it('a listing still loading when the player signs out puts nothing of that account back', async () => {
    const { backup: cloudBackup, cloud } = backup();
    const at = await uploaded(cloudBackup);
    await library.entries[0]!.remove();
    const { load } = cloud.repository;
    let started!: () => void;
    let release!: () => void;
    const called = new Promise<void>((resolve) => (started = resolve));
    const gate = new Promise<void>((resolve) => (release = resolve));
    cloud.repository.load = async (uid) => {
      const result = load(uid); // read while still signed in
      started();
      await gate; // still on the network
      return result;
    };

    const refreshing = cloudBackup.refresh();
    await called;
    await cloudBackup.signOut();
    release();
    await refreshing;

    expect(cloudBackup.characters).toEqual([]);
    expect(cloudBackup.usedBytes).toBe(0);
    expect(await cloudBackup.restore(ID_A, at)).toMatchObject({ ok: false, kind: 'failed' });
    expect(library.entries).toEqual([]);
  });

  it('signed out in another tab, a version this list decoded is not restored', async () => {
    const { backup: cloudBackup, cloud } = backup();
    const at = await uploaded(cloudBackup);
    await library.entries[0]!.remove();
    cloud.state.user = null; // another tab signed out; this one learns it on the next check
    await cloudBackup.refresh();

    expect(await cloudBackup.restore(ID_A, at)).toEqual({
      ok: false,
      kind: 'failed',
      message: 'Sign in with Google to use cloud backup.',
    });
    expect(library.entries).toEqual([]);
  });

  it('switched to another account in another tab, a delete touches neither account', async () => {
    const { backup: cloudBackup, cloud } = backup();
    await uploaded(cloudBackup);
    const mine = structuredClone(cloud.state.stored);
    // The other account holds the same character, so a delete aimed at it would show.
    cloud.state.docs[OTHER.uid] = structuredClone(mine);
    cloud.state.user = OTHER; // another tab switched accounts; this one has not checked since

    expect(await cloudBackup.deleteCharacter(ID_A)).toBe(
      'The cloud refused this account. Sign out, sign in again, and retry.',
    );
    expect(cloud.state.docs[OTHER.uid]).toEqual(mine);
    expect(cloud.state.stored).toEqual(mine);
  });

  it('restores from the listing, downloading nothing more', async () => {
    const { backup: cloudBackup, cloud } = backup();
    const at = await uploaded(cloudBackup);
    await library.entries[0]!.remove();
    const loads = cloud.state.loads;
    expect(await cloudBackup.restore(ID_A, at)).toEqual({ ok: true, id: ID_A });
    expect(cloud.state.loads).toBe(loads);
  });

  it('an upload before the cloud was listed waits for the next listing', async () => {
    const { backup: cloudBackup } = backup();
    expect((await cloudBackup.upload(ID_A)).ok).toBe(true);
    expect(cloudBackup.characters).toEqual([]);
    await cloudBackup.refresh();
    expect(cloudBackup.characters[0]?.versions).toHaveLength(1);
  });

  it('lists a damaged sheet flagged, not dropped, and it can still be deleted', async () => {
    const { backup: cloudBackup, cloud } = backup();
    cloud.state.stored = {
      layoutVersion: 2,
      characters: { [ID_A]: { [AT]: { sheet: new Uint8Array([1, 2, 3]), portrait: null } } },
    };
    await cloudBackup.refresh();
    expect(cloudBackup.characters[0]!.versions[0]).toMatchObject({
      sheet: null,
      fromNewerApp: false,
    });
    expect(cloudBackup.characters[0]!.versions[0]!.problem).toMatch(/damaged/);
    expect(await cloudBackup.deleteVersion(ID_A, AT)).toBeNull();
    expect(cloudBackup.characters).toEqual([]);
  });

  it('flags a version whose portrait is missing from the cloud', async () => {
    const { backup: cloudBackup, cloud } = backup();
    const { sheet } = await encodePayload(docFor(ID_A, 'Sable'), null);
    cloud.state.stored = {
      layoutVersion: 2,
      characters: { [ID_A]: { [AT]: { sheet, portrait: 'f'.repeat(64) } } },
    };
    await cloudBackup.refresh();
    expect(cloudBackup.characters[0]!.versions[0]!.problem).toBe(
      'Its portrait is missing from the cloud.',
    );
  });

  it('reports a cloud from a newer layout, and changes nothing in it', async () => {
    const { backup: cloudBackup, cloud } = backup();
    cloud.state.stored = { layoutVersion: 3 };
    const sentence =
      'Your cloud backups were made by a newer version of the app. Reload to update.';
    expect(await cloudBackup.refresh()).toBe(sentence);
    expect(await cloudBackup.deleteCharacter(ID_A)).toBe(sentence);
    expect(cloud.state.stored).toEqual({ layoutVersion: 3 });
  });

  it('an upload over a newer layout says to update, not to sign in again', async () => {
    const { backup: cloudBackup, cloud } = backup();
    cloud.state.stored = { layoutVersion: 3 };
    expect(await cloudBackup.upload(ID_A)).toEqual({
      ok: false,
      message: 'Your cloud backups were made by a newer version of the app. Reload to update.',
    });
    expect(cloud.state.stored).toEqual({ layoutVersion: 3 });

    // Any other refusal keeps its own sentence: over a readable cloud, or one unreadable for
    // another reason than a newer layout.
    const refusedAccount = {
      ok: false,
      message: 'The cloud refused this account. Sign out, sign in again, and retry.',
    };
    cloud.state.stored = undefined;
    cloud.state.failNext = new CloudError('PERMISSION_DENIED');
    expect(await cloudBackup.upload(ID_A)).toEqual(refusedAccount);
    cloud.state.stored = { layoutVersion: 'two' };
    expect(await cloudBackup.upload(ID_A)).toEqual(refusedAccount);
  });

  it('an upload into a layout-2 cloud this build cannot read still lands, as the rules allow', async () => {
    const { backup: cloudBackup, cloud } = backup();
    const damaged = { layoutVersion: 2, characters: { [ID_B]: 'not a version map' } };
    cloud.state.stored = damaged;
    expect(await cloudBackup.refresh()).toBe(
      'Your cloud backups could not be read. Nothing in the cloud was changed.',
    );

    expect((await cloudBackup.upload(ID_A)).ok).toBe(true);

    const stored = cloud.state.stored as { characters: Record<string, unknown> };
    expect(stored.characters[ID_B]).toBe('not a version map');
    expect(Object.keys(stored.characters[ID_A] as object)).toHaveLength(1);
  });

  it('stores a portrait once for two versions that share it', async () => {
    await repository.savePortrait(ID_A, PORTRAIT);
    const { backup: cloudBackup, cloud } = backup();
    await uploaded(cloudBackup);
    const before = cloudBackup.usedBytes;
    await cloudBackup.upload(ID_A);
    const stored = cloud.state.stored as CloudDocument;
    expect(Object.keys(stored.portraits ?? {})).toHaveLength(1);
    expect(cloudBackup.usedBytes - before).toBe(cloudBackup.characters[0]!.versions[0]!.bytes);
  });

  it('keeps a portrait another version uses, and removes it with its last user', async () => {
    await repository.savePortrait(ID_A, PORTRAIT);
    const { backup: cloudBackup, cloud } = backup();
    const first = await uploaded(cloudBackup);
    const second = (await cloudBackup.upload(ID_A)) as { uploadedAt: string };
    await cloudBackup.deleteVersion(ID_A, first);
    expect(Object.keys((cloud.state.stored as CloudDocument).portraits ?? {})).toHaveLength(1);
    await cloudBackup.deleteVersion(ID_A, second.uploadedAt);
    expect((cloud.state.stored as CloudDocument).portraits).toEqual({});
  });

  it('Delete all versions also removes one another device uploaded since', async () => {
    const cloud = fakeCloud();
    const { backup: here } = backup(cloud);
    await uploaded(here);
    const elsewhere = new CloudBackup(library, {
      load: async () => cloud.repository,
      now: clock(Date.parse('2026-09-25T18:00:00.000Z')),
    });
    await elsewhere.upload(ID_A);
    expect(await here.deleteCharacter(ID_A)).toBeNull();
    expect((cloud.state.stored as CloudDocument).characters).toEqual({});
  });

  it('says how much space an upload needs when the cloud is full, even unlisted', async () => {
    const { backup: cloudBackup, cloud } = backup();
    cloud.state.stored = {
      layoutVersion: 2,
      characters: {
        [ID_B]: { [AT]: { sheet: new Uint8Array(MAX_DOCUMENT_BYTES - 200), portrait: null } },
      },
    };
    const result = await cloudBackup.upload(ID_A); // no refresh: straight from a sheet
    expect(result).toEqual({
      ok: false,
      message: expect.stringMatching(
        /^Not enough cloud space: this version needs [\d.]+ KB and [\d.]+ KB is free\./,
      ) as unknown,
    });
  });

  it('an unexplained upload failure that is not about space keeps its own sentence', async () => {
    const { backup: cloudBackup, cloud } = backup();
    cloud.state.failNext = Object.assign(new Error('boom'), { code: 'internal' });
    expect(await cloudBackup.upload(ID_A)).toEqual({
      ok: false,
      message: 'Cloud backup failed unexpectedly. Try again.',
    });
  });

  it('after signing out, nothing of that account can be restored', async () => {
    const { backup: cloudBackup } = backup();
    const at = await uploaded(cloudBackup);
    await cloudBackup.signOut();
    expect(cloudBackup.usedBytes).toBe(0);
    expect(await cloudBackup.restore(ID_A, at)).toEqual({
      ok: false,
      kind: 'failed',
      message: 'This version is no longer in the cloud.',
    });
  });
});
