import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { CharacterLoadError } from '../migration/errors.js';
import { SCHEMAS } from '../schema/index.js';
import { ID_A, ID_B, createOpener, docFor, putRaw, wipe } from '../../test/fixtures.js';
import { CHARACTER_STORE, createIndexedDbRepository } from './indexedDbRepository.js';

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

  it('refuses to save a document that does not validate, as a typed CharacterLoadError', async () => {
    const repository = createIndexedDbRepository();
    const invalid = { ...docFor(ID_A, 'Sable Nightwind'), armorClass: -1 };

    // A bare .rejects.toThrow() would be satisfied by a TypeError from a refactor. The refusal
    // is part of the layer's error taxonomy (errors.ts: no Zod type escapes the data layer),
    // so assert the type, the code, and that the issue actually names the offending field.
    const caught: unknown = await repository.save(invalid).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(caught).toBeInstanceOf(CharacterLoadError);
    const detail = (caught as CharacterLoadError).detail;
    expect(detail.code).toBe('INVALID_AT_VERSION');
    if (detail.code === 'INVALID_AT_VERSION') {
      expect(detail.version).toBe(1);
      expect(detail.issues.some((issue) => issue.path === 'armorClass')).toBe(true);
    }

    expect(await repository.list()).toEqual([]);
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
