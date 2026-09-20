import { openDB } from 'idb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { SCHEMAS } from '../schema/index.js';
import { ID_A, ID_B, createOpener, docFor, putRaw, wipe } from '../../test/fixtures.js';
import { CHARACTER_STORE, createIndexedDbRepository, type OpenDb } from './indexedDbRepository.js';
import { StorageError, type StorageFailure } from './storageFailure.js';

// Autospy: every export of 'idb' still calls through to the real implementation (so every other
// test in this file gets the genuine, fake-indexeddb-backed behavior) unless a test overrides it
// with mockImplementationOnce — which is how the blocked/terminated wiring tests below capture
// the callbacks object passed to the real openDB() without touching a live connection.
vi.mock('idb', { spy: true });

describe('createIndexedDbRepository', () => {
  beforeEach(wipe);

  it('starts empty', async () => {
    const repository = createIndexedDbRepository();
    expect(await repository.list()).toEqual([]);
  });

  it('saves and reads a document back unchanged', async () => {
    const repository = createIndexedDbRepository();
    const doc = docFor(ID_A, 'Sable Nightwind');
    await repository.save(doc);

    const loaded = await repository.get(ID_A);
    expect(loaded?.ok).toBe(true);
    if (loaded?.ok) expect(loaded.doc).toEqual(doc);
  });

  it('returns null for an id that was never stored', async () => {
    const repository = createIndexedDbRepository();
    expect(await repository.get(ID_A)).toBeNull();
  });

  it('overwrites on a second save of the same id', async () => {
    const repository = createIndexedDbRepository();
    await repository.save(docFor(ID_A, 'Sable Nightwind'));
    await repository.save({ ...docFor(ID_A, 'Sable Nightwind'), armorClass: 18 });

    const loaded = await repository.get(ID_A);
    expect(loaded?.ok).toBe(true);
    if (loaded?.ok) expect(loaded.doc.armorClass).toBe(18);
  });

  it('lists a summary per stored character', async () => {
    const repository = createIndexedDbRepository();
    await repository.save(docFor(ID_A, 'Sable Nightwind'));
    await repository.save(docFor(ID_B, 'Wren Duskwhisper'));

    const entries = await repository.list();
    expect(entries).toHaveLength(2);
    const names = entries.flatMap((entry) => (entry.ok ? [entry.summary.name] : []));
    expect(names.sort()).toEqual(['Sable Nightwind', 'Wren Duskwhisper']);
  });

  it('deletes a character', async () => {
    const repository = createIndexedDbRepository();
    await repository.save(docFor(ID_A, 'Sable Nightwind'));
    await repository.delete(ID_A);

    expect(await repository.get(ID_A)).toBeNull();
    expect(await repository.list()).toEqual([]);
  });

  it('deleting an absent id is not an error', async () => {
    const repository = createIndexedDbRepository();
    await expect(repository.delete(ID_A)).resolves.toBeUndefined();
  });

  it('still lists a damaged document, flagged, rather than hiding it (criterion 15)', async () => {
    await putRaw(ID_A, { schemaVersion: 1, name: 'Broken' });
    const repository = createIndexedDbRepository();

    const entries = await repository.list();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.ok).toBe(false);
    if (entries[0]?.ok === false) {
      expect(entries[0].id).toBe(ID_A);
      expect(entries[0].error.code).toBe('INVALID_AT_VERSION');
    }
  });

  it('one damaged document does not hide the healthy ones', async () => {
    const repository = createIndexedDbRepository();
    await repository.save(docFor(ID_B, 'Wren Duskwhisper'));
    await putRaw(ID_A, { nonsense: true });

    const entries = await repository.list();
    expect(entries).toHaveLength(2);
    // Counts alone would pass an implementation that flagged the WRONG record, so name both
    // sides: the damaged row must be ID_A, and the healthy one must be Wren.
    expect(entries.flatMap((entry) => (entry.ok ? [] : [entry.id]))).toEqual([ID_A]);
    expect(entries.flatMap((entry) => (entry.ok ? [entry.summary.name] : []))).toEqual([
      'Wren Duskwhisper',
    ]);
    expect(entries.flatMap((entry) => (entry.ok ? [entry.summary.id] : []))).toEqual([ID_B]);
  });

  it('lists a healthy row under its store key, not the id inside the value', async () => {
    // The store uses out-of-line keys, and get(id) resolves by key. If list() took the id from
    // the value instead, a document whose id disagreed with its key would be listed under an id
    // get() cannot find — a character visible in the list that cannot be opened. save() keeps
    // the two equal, but the raw-JSON repair screen writes user-edited JSON straight through.
    const divergent = { ...docFor(ID_B, 'Sable Nightwind'), id: ID_B };
    await putRaw(ID_A, divergent);

    const repository = createIndexedDbRepository();
    const entries = await repository.list();

    expect(entries).toHaveLength(1);
    expect(entries[0]?.ok).toBe(true);
    if (entries[0]?.ok) {
      // The document is perfectly valid — this is not a damaged-document case.
      expect(entries[0].summary.name).toBe('Sable Nightwind');
      expect(entries[0].summary.id).toBe(ID_A);

      // The point of the assertion above: the listed id must be addressable.
      const reopened = await repository.get(entries[0].summary.id);
      expect(reopened).not.toBeNull();
      expect(reopened?.ok).toBe(true);
    }
  });

  it('reports a damaged document through get() rather than throwing', async () => {
    await putRaw(ID_A, { schemaVersion: 99 });
    const repository = createIndexedDbRepository();

    const loaded = await repository.get(ID_A);
    expect(loaded?.ok).toBe(false);
    if (loaded && !loaded.ok) expect(loaded.error.code).toBe('FROM_FUTURE');
  });

  it('getRaw returns the stored value verbatim for repair', async () => {
    const damaged = { schemaVersion: 1, name: 'Broken' };
    await putRaw(ID_A, damaged);
    const repository = createIndexedDbRepository();

    expect(await repository.getRaw(ID_A)).toEqual(damaged);
  });

  it('refuses to save an invalid document and says why', async () => {
    const repository = createIndexedDbRepository({ openDb: createOpener() });
    const damaged = { ...docFor(ID_A, 'Sable'), armorClass: -1 };

    // A bare .rejects.toThrow() would be satisfied by a TypeError from a refactor. The refusal
    // is part of the layer's error taxonomy (storageFailure.ts: no Zod type escapes the data
    // layer), so assert the code and that an issue actually names the offending field.
    const caught: unknown = await repository.save(damaged as never).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(caught).toBeInstanceOf(StorageError);
    const detail = (caught as StorageError).detail;
    expect(detail.code).toBe('SAVE_REFUSED');
    if (detail.code === 'SAVE_REFUSED') {
      expect(detail.issues.some((issue) => issue.path === 'armorClass')).toBe(true);
    }

    expect(await repository.list()).toEqual([]);
  });

  it('surfaces a quota failure from save as a typed rejection', async () => {
    // A two-method stub, not a Proxy wrapping a real connection: save() only ever calls put()
    // and close(), so faking the rest of IDBPDatabase's surface buys nothing. A Proxy forwarding
    // to a real connection was tried here and reverted — idb's wrapper functions look up the
    // real IDBDatabase through a WeakMap keyed by exact object identity, and a leaked forwarding
    // reference outlived its test, corrupting an unrelated test with a `deleteDatabase was
    // blocked` failure. Faithfulness to idb's full shape isn't worth that fragility here.
    const openDb = (() =>
      Promise.resolve({
        put: () => Promise.reject(new DOMException('full', 'QuotaExceededError')),
        close: () => {},
      })) as unknown as OpenDb;
    const repository = createIndexedDbRepository({ openDb });

    await expect(repository.save(docFor(ID_A, 'Sable'))).rejects.toMatchObject({
      detail: { code: 'QUOTA_EXCEEDED' },
    });
  });

  it('rejects list() when its transaction aborts', async () => {
    // Proves the transaction-abort path: list() awaits tx.done, so an abort with no in-flight
    // request rejects the call instead of surfacing as an unhandled rejection.
    const openDb = (() =>
      Promise.resolve({
        transaction: () => ({
          store: { openCursor: () => Promise.resolve(null) },
          done: Promise.reject(new DOMException('aborted', 'AbortError')),
        }),
        close: () => {},
      })) as unknown as OpenDb;
    const repository = createIndexedDbRepository({ openDb });

    await expect(repository.list()).rejects.toMatchObject({ detail: { code: 'UNKNOWN' } });
  });

  it('wires the default opener to report a blocked version bump to onFailure', async () => {
    // This proves the WIRING — that makeDefaultOpenDb's `blocked` callback forwards to
    // onFailure with the right StorageFailure — not that a browser ever fires `blocked`.
    // Racing a real second connection against fake-indexeddb was tried and is not
    // deterministic there, and a leaked connection from that approach is exactly what
    // corrupted an unrelated test above. Mocking idb's openDB captures the callbacks object
    // the real (non-test-overridden) opener passes, with no live connection involved.
    type Callbacks = { blocked?: () => void; blocking?: () => void; terminated?: () => void };
    const failures: StorageFailure[] = [];
    let blocked: (() => void) | undefined;
    vi.mocked(openDB).mockImplementationOnce(((
      _name: string,
      _version: number | undefined,
      callbacks: Callbacks | undefined,
    ) => {
      blocked = callbacks?.blocked;
      return Promise.resolve({
        transaction: () => ({
          store: { openCursor: () => Promise.resolve(null) },
          done: Promise.resolve(),
        }),
        close: () => {},
      });
    }) as never);

    const repository = createIndexedDbRepository({
      onFailure: (failure) => failures.push(failure),
    });
    await repository.list();

    expect(blocked).toBeTypeOf('function');
    blocked?.();
    expect(failures).toContainEqual({ code: 'BLOCKED' });
  });

  it('wires the default opener to report a terminated connection to onFailure', async () => {
    // Same judgement as the blocked test above: this proves the callback is wired to
    // onFailure, not that the browser ever calls `terminated`.
    type Callbacks = { blocked?: () => void; blocking?: () => void; terminated?: () => void };
    const failures: StorageFailure[] = [];
    let terminated: (() => void) | undefined;
    vi.mocked(openDB).mockImplementationOnce(((
      _name: string,
      _version: number | undefined,
      callbacks: Callbacks | undefined,
    ) => {
      terminated = callbacks?.terminated;
      return Promise.resolve({
        transaction: () => ({
          store: { openCursor: () => Promise.resolve(null) },
          done: Promise.resolve(),
        }),
        close: () => {},
      });
    }) as never);

    const repository = createIndexedDbRepository({
      onFailure: (failure) => failures.push(failure),
    });
    await repository.list();

    expect(terminated).toBeTypeOf('function');
    terminated?.();
    expect(failures).toContainEqual({ code: 'UNAVAILABLE', cause: 'connection terminated' });
  });

  it('migrates a document written by an older schema version', async () => {
    const v1Doc = docFor(ID_A, 'Sable');
    // A synthetic two-version world: version 1 is the real schema, version 2 is what this
    // build claims to write, and the migration from 1 to 2 is the identity plus a version bump.
    const registry = {
      current: 2,
      schemas: {
        1: SCHEMAS[1]!,
        2: z.looseObject({ schemaVersion: z.literal(2) }),
      },
      migrations: new Map([[1, (doc: unknown) => ({ ...(doc as object), schemaVersion: 2 })]]),
    };
    const repository = createIndexedDbRepository({ registry, openDb: createOpener() });

    const db = await createOpener()();
    try {
      await db.put(CHARACTER_STORE, v1Doc, ID_A);
    } finally {
      db.close();
    }

    const loaded = await repository.get(ID_A);
    expect(loaded?.ok).toBe(true);
    expect((loaded as { doc: { schemaVersion: number } }).doc.schemaVersion).toBe(2);
  });
});
