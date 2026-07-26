import { beforeEach, describe, expect, it } from 'vitest';
import { createCharacter } from '../schema/index.js';
import {
  CHARACTER_STORE,
  DB_NAME,
  createIndexedDbRepository,
  openDb,
} from './indexedDbRepository.js';

const ID_A = '3f1a6c2e-8b4d-4a19-9c7e-1d2b3a4c5d6e';
const ID_B = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

const docFor = (id: string, name: string) =>
  createCharacter({ name, id, now: new Date('2026-07-25T09:41:00.000Z') });

/** Writes a value straight into the store, bypassing validation, to simulate damage. */
async function putRaw(id: string, value: unknown): Promise<void> {
  const db = await openDb();
  await db.put(CHARACTER_STORE, value, id);
  db.close();
}

async function wipe(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

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
    expect(entries.filter((entry) => entry.ok)).toHaveLength(1);
    expect(entries.filter((entry) => !entry.ok)).toHaveLength(1);
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

  it('refuses to save a document that does not validate', async () => {
    const repository = createIndexedDbRepository();
    const invalid = { ...docFor(ID_A, 'Sable Nightwind'), armorClass: -1 };
    await expect(repository.save(invalid)).rejects.toThrow();
    expect(await repository.list()).toEqual([]);
  });
});
