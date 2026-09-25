import { initializeApp, setLogLevel } from 'firebase/app';
import {
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  setDoc,
  type Firestore,
} from 'firebase/firestore/lite';
import { beforeEach, describe, expect, it } from 'vitest';
import { ID_A, ID_B } from '../../test/fixtures.js';
import { cloudDocumentSize, withVersion, type NewVersion } from './cloudDocument.js';
import { createCloudStore } from './cloudStore.js';
import { MAX_DOCUMENT_BYTES } from './size.js';

setLogLevel('silent');

const PROJECT = 'dnd-character-sheet-64a24';
const [HOST = '127.0.0.1', PORT = '8181'] = (
  process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8181'
).split(':');
const EMULATOR = `http://${HOST}:${PORT}`;
const T1 = '2026-09-25T10:00:00.000Z';
const T2 = '2026-09-25T11:00:00.000Z';
const H1 = '1'.repeat(64);

let apps = 0;
/** A client signed in as `uid`: the emulator trusts a mock token, so no Auth emulator is needed. */
function as(uid: string): Firestore {
  const db = getFirestore(
    initializeApp({ projectId: PROJECT, apiKey: 'emulator' }, `app${apps++}`),
  );
  connectFirestoreEmulator(db, HOST, Number(PORT), { mockUserToken: { sub: uid, user_id: uid } });
  return db;
}
const storeAs = (uid: string) => createCloudStore(as(uid), () => uid);

/** Writes past the rules, as the seed script does. The app never sends this header. */
async function adminPatch(path: string, fields: object): Promise<void> {
  const url = `${EMULATOR}/v1/projects/${PROJECT}/databases/(default)/documents/${path}`;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
}

interface RestDocument {
  fields?: Record<string, unknown>;
}

/** Reads past the rules too: what a write actually left in storage, not what the store computed. */
async function adminGet(path: string): Promise<RestDocument> {
  const url = `${EMULATOR}/v1/projects/${PROJECT}/databases/(default)/documents/${path}`;
  const response = await fetch(url, { headers: { Authorization: 'Bearer owner' } });
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  return (await response.json()) as RestDocument;
}

const refusal = (promise: Promise<unknown>) =>
  promise.then(
    () => 'allowed',
    (caught: { code?: string }) => caught.code,
  );

const sheet = (n: number) => new Uint8Array(n).fill(7);
const plain = (n: number): NewVersion => ({ sheet: sheet(n), portrait: null });
const pictured = (n: number): NewVersion => ({
  sheet: sheet(n),
  portrait: { hash: H1, bytes: new Uint8Array([9]) },
});

beforeEach(async () => {
  await fetch(`${EMULATOR}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: 'DELETE',
  });
});

describe('cloudStore against the emulator and the real rules', () => {
  it('uploads, loads the bytes back, and deletes', async () => {
    const store = storeAs('u1');
    await store.upload(ID_A, T1, plain(3));
    expect(await store.load()).toEqual({
      ok: true,
      doc: {
        layoutVersion: 2,
        characters: { [ID_A]: { [T1]: { sheet: sheet(3), portrait: null } } },
      },
    });
    const deleted = await store.deleteVersions(ID_A, [T1]);
    expect(deleted).toEqual({
      ok: true,
      doc: { layoutVersion: 2, characters: {} },
    });
    // Not just the return value (computed locally by withoutVersions): what the transaction
    // actually left in storage.
    expect(await store.load()).toEqual(deleted);
  });

  it('a partial delete removes only the named version, in the stored document too', async () => {
    const store = storeAs('u1');
    await store.upload(ID_A, T1, plain(1));
    await store.upload(ID_A, T2, plain(2));
    const deleted = await store.deleteVersions(ID_A, [T1]);
    expect(deleted).toEqual({
      ok: true,
      doc: {
        layoutVersion: 2,
        characters: { [ID_A]: { [T2]: { sheet: sheet(2), portrait: null } } },
      },
    });
    // `T1` is an ISO timestamp and contains dots: a field path built by joining segments with
    // '.' rather than `new FieldPath(...)` would split on them and silently miss this field,
    // leaving T1 stored even though the return value above says it is gone.
    expect(await store.load()).toEqual(deleted);
  });

  it('a delete removes a portrait no longer referenced, in the stored document too', async () => {
    const store = storeAs('u1');
    await store.upload(ID_A, T1, pictured(1));
    const deleted = await store.deleteVersions(ID_A, [T1]);
    expect(deleted).toEqual({
      ok: true,
      doc: { layoutVersion: 2, characters: {}, portraits: {} },
    });
    expect(await store.load()).toEqual(deleted);
  });

  it('an upload without a portrait keeps the portraits already stored', async () => {
    const store = storeAs('u1');
    await store.upload(ID_A, T1, pictured(1));
    await store.upload(ID_A, T2, plain(1));
    const loaded = await store.load();
    expect(loaded.ok && Object.keys(loaded.doc?.portraits ?? {})).toEqual([H1]);
    expect(loaded.ok && Object.keys(loaded.doc?.characters[ID_A] ?? {})).toEqual([T1, T2]);
  });

  it('two devices uploading at once both keep their version', async () => {
    await Promise.all([
      storeAs('u1').upload(ID_A, T1, plain(1)),
      storeAs('u1').upload(ID_A, T2, plain(1)),
    ]);
    const loaded = await storeAs('u1').load();
    expect(loaded.ok && Object.keys(loaded.doc?.characters[ID_A] ?? {}).sort()).toEqual([T1, T2]);
  });

  it('a delete decides from what it reads, not from what the caller last listed', async () => {
    // Another device uploads a version with the same portrait after this one's last load.
    const here = storeAs('u1');
    await here.upload(ID_A, T1, pictured(1));
    await storeAs('u1').upload(ID_B, T1, pictured(1));
    const left = await here.deleteVersions(ID_A, null);
    expect(left.ok && Object.keys(left.doc?.portraits ?? {})).toEqual([H1]);
  });

  it("refuses another account's reads and writes", async () => {
    await storeAs('u1').upload(ID_A, T1, plain(1));
    const eve = as('eve');
    expect(await refusal(getDoc(doc(eve, 'cloud', 'u1')))).toBe('permission-denied');
    expect(await refusal(createCloudStore(eve, () => 'u1').upload(ID_A, T2, plain(1)))).toBe(
      'permission-denied',
    );
  });

  it('refuses every other path, including the old layout', async () => {
    const db = as('u1');
    expect(
      await refusal(setDoc(doc(db, 'users', 'u1', 'characters', ID_A), { versions: {} })),
    ).toBe('permission-denied');
    expect(await refusal(setDoc(doc(db, 'cloud', 'u1', 'extra', 'x'), { a: 1 }))).toBe(
      'permission-denied',
    );
  });

  it('refuses a wrong layoutVersion, an extra field, and a delete of the document', async () => {
    const db = as('u1');
    const ref = doc(db, 'cloud', 'u1');
    expect(await refusal(setDoc(ref, { layoutVersion: 3, characters: {} }))).toBe(
      'permission-denied',
    );
    expect(await refusal(setDoc(ref, { layoutVersion: 2, characters: {}, junk: 1 }))).toBe(
      'permission-denied',
    );
    await storeAs('u1').upload(ID_A, T1, plain(1));
    expect(await refusal(deleteDoc(ref))).toBe('permission-denied');
  });

  it('refuses an old build writing over a newer layout', async () => {
    await adminPatch('cloud/u1', { layoutVersion: { integerValue: '3' } });
    expect(await refusal(storeAs('u1').upload(ID_A, T1, plain(1)))).toBe('permission-denied');
  });

  it('reports a newer layout on load and on delete, and deletes nothing', async () => {
    // Firestore's REST wire shape, not the store's — seeded so there is something in the
    // document a broken guard could actually delete, and something to check survived.
    const seededCharacters = {
      mapValue: {
        fields: {
          [ID_A]: {
            mapValue: {
              fields: {
                [T1]: {
                  mapValue: {
                    fields: {
                      sheet: { stringValue: 'unreadable at this layout' },
                      portrait: { nullValue: null },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
    await adminPatch('cloud/u1', {
      layoutVersion: { integerValue: '3' },
      characters: seededCharacters,
    });
    const store = storeAs('u1');
    expect(await store.load()).toMatchObject({ ok: false, error: { code: 'FROM_FUTURE' } });
    expect(await store.deleteVersions(ID_A, null)).toMatchObject({ ok: false });
    // Not just the return value: the document this build could not read must be untouched.
    expect((await adminGet('cloud/u1')).fields?.characters).toEqual(seededCharacters);
  });

  it('refuses a write exactly where size.ts puts the limit', async () => {
    // Four versions, so no single field comes near Firestore's separate 1,048,487-byte field cap.
    async function fill(uid: string, extra: number) {
      const store = storeAs(uid);
      for (const [index, at] of [T1, T2, '2026-09-25T12:00:00.000Z'].entries()) {
        await store.upload(ID_A, at, plain(300_000 + index));
      }
      const loaded = await store.load();
      if (!loaded.ok) throw new Error('unreadable');
      const last = '2026-09-25T13:00:00.000Z';
      const empty = cloudDocumentSize(uid, withVersion(loaded.doc, ID_A, last, plain(0)));
      return store.upload(ID_A, last, plain(MAX_DOCUMENT_BYTES - empty + extra));
    }
    expect(await refusal(fill('exact', 0))).toBe('allowed');
    expect(await refusal(fill('over', 1))).toBe('failed-precondition');
  });
});
