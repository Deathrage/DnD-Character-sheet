import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createIndexedDbRepository } from '../data/repository/indexedDbRepository.js';
import type { CharacterRepository } from '../data/repository/types.js';
import { ID_A, ID_B, createOpener, docFor, putRaw, wipe } from '../test/fixtures.js';
import { CharacterFile } from './characterFile.js';
import { CharacterLibraryBO } from './characterLibrary.js';
import type { CharacterSheetBO } from './characterSheet.js';
import { StorageGate } from './storageGate.js';

/**
 * A real repository over `fake-indexeddb`, not a stub. The library's whole job is the sequence
 * it runs against one — save before pushing a row, attach autosave to what it hands back — and a
 * stub would let every one of those orderings pass while being wrong.
 */
function libraryOver(
  repository: CharacterRepository,
  storageGate = new StorageGate({ port: null }),
) {
  return new CharacterLibraryBO({
    repository,
    storageGate,
    // `target: null` so no `pagehide` listener is attached to the test runner's global, and a
    // zero debounce so a save lands on the next macrotask instead of half a second later.
    autosave: { debounceMs: 0, target: null },
  });
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('CharacterLibraryBO', () => {
  let repository: CharacterRepository;

  beforeEach(async () => {
    await wipe();
    repository = createIndexedDbRepository({ openDb: createOpener() });
  });
  afterEach(wipe);

  it('is empty until load resolves, then lists what is stored', async () => {
    await repository.save(docFor(ID_A, 'Sable'));
    const library = libraryOver(repository);
    expect(library.entries).toEqual([]);

    await library.load();

    expect(library.entries.map((entry) => entry.name)).toEqual(['Sable']);
    expect(library.entries[0]?.isDamaged).toBe(false);
    expect(library.entries[0]?.problem).toBeNull();
  });

  it('reports a store that cannot be listed, instead of rejecting', async () => {
    const storageGate = new StorageGate({ port: null });
    const broken: CharacterRepository = {
      ...repository,
      list: () => Promise.reject(new Error('IndexedDB is blocked')),
    };
    const library = libraryOver(broken, storageGate);

    // The app awaits this before its first render, so a rejection left the screen on "Loading…"
    // permanently with no message — reachable for real in a browser that blocks IndexedDB.
    await expect(library.load()).resolves.toBeUndefined();

    expect(library.entries).toEqual([]);
    // Not swallowed: it lands on the banner, which is where a player can act on it.
    expect(storageGate.failure).toEqual({ code: 'UNKNOWN', cause: expect.any(Error) as unknown });
  });

  it('summarises a row without opening the document', async () => {
    const doc = docFor(ID_A, 'Sable');
    doc.classes.push(
      { id: '11111111-1111-4111-8111-111111111111', name: 'Rogue', level: 5 },
      { id: '22222222-2222-4222-8222-222222222222', name: 'Wizard', level: 2 },
    );
    doc.hitPoints = { current: 38, total: 45, temporary: 5 };
    await repository.save(doc);

    const library = libraryOver(repository);
    await library.load();
    const entry = library.entries[0];

    expect(entry?.totalLevel).toBe(7);
    expect(entry?.classes).toEqual([
      { name: 'Rogue', level: 5 },
      { name: 'Wizard', level: 2 },
    ]);
    expect(entry?.hitPoints).toEqual({ current: 38, total: 45, temporary: 5 });
  });

  it('lists a damaged document, flagged and explained', async () => {
    await putRaw(ID_A, { schemaVersion: 99, id: ID_A });
    const library = libraryOver(repository);

    await library.load();
    const entry = library.entries[0];

    // Criterion 15: listed, not dropped and not repaired.
    expect(entry?.id).toBe(ID_A);
    expect(entry?.isDamaged).toBe(true);
    expect(entry?.problem).toMatch(/newer version of the app/);
    expect(await entry?.open()).toEqual({
      ok: false,
      message: expect.stringMatching(/newer version of the app/) as unknown as string,
    });
  });

  it('hands a damaged document back as raw text for the repair screen', async () => {
    await putRaw(ID_A, { schemaVersion: 99, id: ID_A, name: 'Half a character' });
    const library = libraryOver(repository);
    await library.load();

    const text = await library.entries[0]?.rawText();

    expect(text).toContain('"name": "Half a character"');
    expect(text?.endsWith('\n')).toBe(true);
  });

  describe('create', () => {
    it('stores the character before returning, so the row exists immediately', async () => {
      const library = libraryOver(repository);
      const sheet = await library.create('Sable');

      // Criterion 1: not awaited from a reload — the row is in the list right now...
      expect(library.entries.map((entry) => entry.name)).toEqual(['Sable']);
      expect(library.entries[0]?.id).toBe(sheet.id);
      // ...and in the store, before a single edit.
      expect(await repository.list()).toHaveLength(1);
    });

    it('trims the name and refuses an empty one', async () => {
      const library = libraryOver(repository);
      const sheet = await library.create('  Sable  ');
      expect(sheet.name).toBe('Sable');
      await expect(library.create('   ')).rejects.toThrow(/must not be empty/);
    });

    it('autosaves edits to the sheet it returns', async () => {
      const library = libraryOver(repository);
      const sheet = await library.create('Sable');

      sheet.hitPoints.setTotal(45);
      await settle();

      const stored = await repository.get(sheet.id);
      expect(stored?.ok).toBe(true);
      // Without the attach in `create`, every edit before the first navigation would be lost.
      expect(stored?.ok === true && stored.doc.hitPoints.total).toBe(45);
    });
  });

  describe('add', () => {
    it('imports a file as a second character rather than overwriting the first', async () => {
      const library = libraryOver(repository);
      const original = await library.create('Sable');
      original.classes.add({ name: 'Rogue', level: 5 });

      const read = CharacterFile.read(CharacterFile.of(original, new Date()).text);
      expect(read.ok).toBe(true);
      if (!read.ok) return;
      const copy = await library.add(read.file);

      expect(copy.id).not.toBe(original.id);
      expect(copy.classes.items.map((entry) => entry.name)).toEqual(['Rogue']);
      expect(library.entries).toHaveLength(2);
      expect(await repository.list()).toHaveLength(2);
    });

    it('autosaves edits to an imported sheet too', async () => {
      const library = libraryOver(repository);
      const read = CharacterFile.read(
        CharacterFile.of(await library.create('Sable'), new Date()).text,
      );
      if (!read.ok) return;
      const copy = await library.add(read.file);

      copy.hitPoints.setTotal(30);
      await settle();

      const stored = await repository.get(copy.id);
      expect(stored?.ok === true && stored.doc.hitPoints.total).toBe(30);
    });
  });

  describe('entry.open', () => {
    it('returns a live sheet that autosaves', async () => {
      await repository.save(docFor(ID_A, 'Sable'));
      const library = libraryOver(repository);
      await library.load();

      const opened = await library.entries[0]?.open();
      expect(opened?.ok).toBe(true);
      if (opened?.ok !== true) return;
      opened.sheet.setArmorClass(15);
      await settle();

      const stored = await repository.get(ID_A);
      expect(stored?.ok === true && stored.doc.armorClass).toBe(15);
    });

    it('stops autosaving once the sheet is disposed', async () => {
      await repository.save(docFor(ID_A, 'Sable'));
      const library = libraryOver(repository);
      await library.load();
      const opened = await library.entries[0]?.open();
      if (opened?.ok !== true) return;
      const sheet: CharacterSheetBO = opened.sheet;

      sheet.setArmorClass(15);
      await settle();
      sheet.dispose();
      sheet.setArmorClass(99);
      await settle();

      const stored = await repository.get(ID_A);
      // The edit before dispose is kept — `stop()` flushes — and the one after is not saved.
      expect(stored?.ok === true && stored.doc.armorClass).toBe(15);
    });

    it('explains a row that has left the store since the list was built', async () => {
      await repository.save(docFor(ID_A, 'Sable'));
      const library = libraryOver(repository);
      await library.load();
      await repository.delete(ID_A);

      expect(await library.entries[0]?.open()).toEqual({
        ok: false,
        message: 'This character is no longer in this browser.',
      });
    });
  });

  /**
   * A list row is a snapshot of the document, taken once. Found by the dev reseed button and then
   * reproduced in the app itself: create a character, give it a class and some hit points, go back
   * to the list — and the row still read "No class · Level 0" until the page was reloaded, because
   * nothing ever re-took the snapshot.
   */
  describe('the list row follows the sheet', () => {
    /**
     * `await library.flush()` rather than a zero debounce and a settle. The debounce timer would
     * fire first and leave the write in flight, so an assertion right after it would be racing the
     * database — the version of these tests that did exactly that failed for that reason and not
     * for the one they are about.
     */
    const unhurried = () =>
      new CharacterLibraryBO({
        repository,
        storageGate: new StorageGate({ port: null }),
        autosave: { debounceMs: 60_000, target: null },
      });

    it('re-summarises a row when the sheet it describes is saved', async () => {
      const library = unhurried();
      const sheet = await library.create('Sable');
      expect(library.entries[0]?.totalLevel).toBe(0);

      sheet.classes.add({ name: 'Rogue', level: 5 });
      sheet.hitPoints.setTotal(45);
      sheet.hitPoints.setCurrent(38);
      await library.flush();

      const entry = library.entries[0];
      expect(entry?.totalLevel).toBe(5);
      expect(entry?.classes).toEqual([{ name: 'Rogue', level: 5 }]);
      expect(entry?.hitPoints).toEqual({ current: 38, total: 45, temporary: 0 });
    });

    it('refreshes in place, so a caller holding the entry sees the new values', async () => {
      const library = unhurried();
      const sheet = await library.create('Sable');
      // Taken before the edit and deliberately kept: the raw-JSON screen keys an effect on entry
      // identity, so a refresh must not swap the object out from under it.
      const held = library.entries[0];

      sheet.hitPoints.setTotal(45);
      await library.flush();

      expect(held).toBe(library.entries[0]);
      expect(held?.hitPoints.total).toBe(45);
    });

    it('leaves other rows alone', async () => {
      const library = unhurried();
      const sable = await library.create('Sable');
      await library.create('Thorne');

      sable.hitPoints.setTotal(45);
      await library.flush();

      const thorne = library.entries.find((entry) => entry.name === 'Thorne');
      expect(thorne?.hitPoints.total).toBe(0);
    });
  });

  describe('flush', () => {
    /**
     * A long debounce, so nothing can reach the store on its own during the test: what is being
     * asserted is that `flush()` wrote it, not that waiting long enough would have.
     */
    const unhurried = (storageGate = new StorageGate({ port: null })) =>
      new CharacterLibraryBO({
        repository,
        storageGate,
        autosave: { debounceMs: 60_000, target: null },
      });

    it('writes every open sheet before it resolves', async () => {
      const library = unhurried();
      const first = await library.create('Sable');
      const second = await library.create('Thorne');
      first.hitPoints.setTotal(45);
      second.hitPoints.setTotal(71);

      const beforeFlush = await repository.get(first.id);
      expect(beforeFlush?.ok === true && beforeFlush.doc.hitPoints.total).toBe(0);

      await library.flush();

      const storedFirst = await repository.get(first.id);
      const storedSecond = await repository.get(second.id);
      expect(storedFirst?.ok === true && storedFirst.doc.hitPoints.total).toBe(45);
      expect(storedSecond?.ok === true && storedSecond.doc.hitPoints.total).toBe(71);
    });

    it('ignores an edit made to a sheet that was already disposed', async () => {
      const library = unhurried();
      const sheet = await library.create('Sable');
      sheet.dispose();

      sheet.hitPoints.setTotal(45);
      await library.flush();

      const stored = await repository.get(sheet.id);
      expect(stored?.ok === true && stored.doc.hitPoints.total).toBe(0);
    });
  });

  describe('entry.repair', () => {
    it('stores hand-edited text under the same id and heals the row', async () => {
      await putRaw(ID_A, { schemaVersion: 99, id: ID_A });
      const library = libraryOver(repository);
      await library.load();
      expect(library.entries[0]?.isDamaged).toBe(true);

      const fixed = docFor(ID_A, 'Repaired');
      expect(await library.entries[0]?.repair(JSON.stringify(fixed))).toBeNull();

      // Same row, not a second one beside the broken original.
      expect(library.entries).toHaveLength(1);
      expect(library.entries[0]?.id).toBe(ID_A);
      expect(library.entries[0]?.isDamaged).toBe(false);
      expect(library.entries[0]?.name).toBe('Repaired');
    });

    it('keeps the character id even when the text carries a different one', async () => {
      await putRaw(ID_A, { schemaVersion: 99, id: ID_A });
      const library = libraryOver(repository);
      await library.load();

      // A player who pasted another character's JSON must not silently create a duplicate or
      // overwrite the character it came from.
      await library.entries[0]?.repair(JSON.stringify(docFor(ID_B, 'Someone Else')));

      const stored = await repository.list();
      expect(stored).toHaveLength(1);
      expect(stored[0]?.ok === true && stored[0].summary.id).toBe(ID_A);
    });

    it('returns the syntax error and writes nothing', async () => {
      await putRaw(ID_A, { schemaVersion: 99, id: ID_A });
      const library = libraryOver(repository);
      await library.load();

      const message = await library.entries[0]?.repair('{ "name": ');

      expect(message).toMatch(/not valid JSON/);
      // The text is often the only copy of the fix, so a rejected commit must change nothing.
      expect(library.entries[0]?.isDamaged).toBe(true);
      expect(await library.entries[0]?.rawText()).toContain('"schemaVersion": 99');
    });

    it('returns the failing field paths for text that is valid JSON but not a character', async () => {
      await putRaw(ID_A, { schemaVersion: 99, id: ID_A });
      const library = libraryOver(repository);
      await library.load();

      const message = await library.entries[0]?.repair(
        JSON.stringify({ schemaVersion: 1, name: 'Half a character' }),
      );

      expect(message).toMatch(/does not match schema version 1/);
      expect(library.entries[0]?.isDamaged).toBe(true);
    });
  });

  describe('entry.remove', () => {
    it('deletes the document and drops the row', async () => {
      await repository.save(docFor(ID_A, 'Sable'));
      const library = libraryOver(repository);
      await library.load();

      await library.entries[0]?.remove();

      expect(library.entries).toEqual([]);
      expect(await repository.list()).toEqual([]);
    });
  });

  describe('entry.clone', () => {
    it('stores a copy under a new id and lists it', async () => {
      const original = docFor(ID_A, 'Sable');
      original.armorClass = 17;
      await repository.save(original);
      const library = libraryOver(repository);
      await library.load();

      expect(await library.entries[0]?.clone()).toBeNull();

      expect(library.entries.map((entry) => entry.name)).toEqual(['Sable', 'Sable (copy)']);
      const copyId = library.entries[1]?.id ?? '';
      expect(copyId).not.toBe(ID_A);
      const stored = await repository.get(copyId);
      expect(stored?.ok === true && stored.doc.armorClass).toBe(17);
      // The original is untouched.
      const source = await repository.get(ID_A);
      expect(source?.ok === true && source.doc.name).toBe('Sable');
    });

    it('keeps the copy name within the length limit', async () => {
      await repository.save(docFor(ID_A, 'x'.repeat(80)));
      const library = libraryOver(repository);
      await library.load();

      expect(await library.entries[0]?.clone()).toBeNull();

      expect(library.entries[1]?.name).toBe(`${'x'.repeat(73)} (copy)`);
    });

    it('refuses to clone a damaged document', async () => {
      await putRaw(ID_A, { schemaVersion: 1, id: ID_A });
      const library = libraryOver(repository);
      await library.load();

      expect(await library.entries[0]?.clone()).toMatch(/.+/);
      expect(library.entries).toHaveLength(1);
    });
  });

  it('reports an autosave failure to storage rather than swallowing it', async () => {
    const storageGate = new StorageGate({ port: null });
    const failing: CharacterRepository = {
      ...repository,
      save: (doc) =>
        doc.hitPoints.total === 45 ? Promise.reject(new Error('quota')) : repository.save(doc),
    };
    const library = libraryOver(failing, storageGate);
    const sheet = await library.create('Sable');

    sheet.hitPoints.setTotal(45);
    await settle();

    expect(storageGate.failure).toEqual({ code: 'UNKNOWN', cause: expect.any(Error) as unknown });
  });
});

describe('CharacterLibraryBO portraits', () => {
  const PORTRAIT = 'data:image/jpeg;base64,/9j/4AAQ';
  let repository: CharacterRepository;

  beforeEach(async () => {
    await wipe();
    repository = createIndexedDbRepository({ openDb: createOpener() });
  });
  afterEach(wipe);

  it('stores a changed portrait beside the document, and shows it on the list row', async () => {
    const library = libraryOver(repository);
    const sheet = await library.create('Sable');

    sheet.setPortrait(PORTRAIT);
    await library.flush();

    expect(await repository.getPortrait(sheet.id)).toBe(PORTRAIT);
    expect(library.entries[0]?.portrait).toBe(PORTRAIT);
    const raw = JSON.stringify(await repository.getRaw(sheet.id));
    expect(raw).not.toContain('base64');
    sheet.dispose();
  });

  it('keeps the row portrait when a later document save re-summarises the row', async () => {
    const library = libraryOver(repository);
    const sheet = await library.create('Sable');
    sheet.setPortrait(PORTRAIT);
    await library.flush();

    sheet.setArmorClass(15);
    await library.flush();

    expect(library.entries[0]?.portrait).toBe(PORTRAIT);
    sheet.dispose();
  });

  it('opens a sheet with its stored portrait', async () => {
    await repository.save(docFor(ID_A, 'Sable'), PORTRAIT);
    const library = libraryOver(repository);
    await library.load();

    const opened = await library.entries[0]!.open();
    expect(opened.ok).toBe(true);
    if (opened.ok) {
      expect(opened.sheet.portrait).toBe(PORTRAIT);
      opened.sheet.dispose();
    }
  });

  it('imports a file with its portrait', async () => {
    const source = libraryOver(repository);
    const sheet = await source.create('Sable');
    sheet.setPortrait(PORTRAIT);
    const read = CharacterFile.read(CharacterFile.of(sheet, new Date()).text);
    sheet.dispose();
    if (!read.ok) throw new Error(read.message);

    const imported = await libraryOver(repository).add(read.file);

    expect(imported.portrait).toBe(PORTRAIT);
    expect(await repository.getPortrait(imported.id)).toBe(PORTRAIT);
    imported.dispose();
  });

  it('clones the portrait with the character', async () => {
    await repository.save(docFor(ID_A, 'Sable'), PORTRAIT);
    const library = libraryOver(repository);
    await library.load();

    expect(await library.entries[0]!.clone()).toBeNull();

    const copy = library.entries.find((entry) => entry.id !== ID_A)!;
    expect(copy.portrait).toBe(PORTRAIT);
    expect(await repository.getPortrait(copy.id)).toBe(PORTRAIT);
  });

  it('removes the portrait with the character', async () => {
    await repository.save(docFor(ID_A, 'Sable'), PORTRAIT);
    const library = libraryOver(repository);
    await library.load();

    await library.entries[0]!.remove();

    expect(await repository.getPortrait(ID_A)).toBeNull();
  });

  it('leaves the portrait alone when the raw-JSON editor repairs the document', async () => {
    await repository.save(docFor(ID_A, 'Sable'), PORTRAIT);
    const library = libraryOver(repository);
    await library.load();
    const entry = library.entries[0]!;

    expect(
      await entry.repair((await entry.rawText()).replace('"Sable"', '"Sable Nightwind"')),
    ).toBeNull();

    expect(await repository.getPortrait(ID_A)).toBe(PORTRAIT);
    expect(library.entries[0]?.portrait).toBe(PORTRAIT);
  });
});

describe('CharacterLibraryBO restore', () => {
  let repository: CharacterRepository;

  beforeEach(async () => {
    await wipe();
    repository = createIndexedDbRepository({ openDb: createOpener() });
  });
  afterEach(wipe);

  it('adds a character that is not here, under its own id', async () => {
    const library = libraryOver(repository);
    await library.load();

    await library.restore(docFor(ID_A, 'Sable'), null);

    expect(library.entries.map((entry) => [entry.id, entry.name])).toEqual([[ID_A, 'Sable']]);
    expect((await repository.get(ID_A))?.ok).toBe(true);
  });

  it('replaces a damaged row in place, and it stops being damaged', async () => {
    await putRaw(ID_A, { not: 'a character' });
    const library = libraryOver(repository);
    await library.load();
    const entry = library.entries[0];
    expect(entry?.isDamaged).toBe(true);

    await library.restore(docFor(ID_A, 'Sable'), null);

    // Same object: the raw-JSON screen keys an effect on entry identity.
    expect(library.entries).toHaveLength(1);
    expect(library.entries[0]).toBe(entry);
    expect(entry?.isDamaged).toBe(false);
    expect(entry?.name).toBe('Sable');
    const stored = await repository.get(ID_A);
    expect(stored?.ok && stored.doc.name).toBe('Sable');
  });

  it('stores the portrait with the document', async () => {
    const portrait = `data:image/jpeg;base64,${btoa('jpeg')}`;
    const library = libraryOver(repository);
    await library.restore(docFor(ID_A, 'Sable'), portrait);
    expect(await repository.getPortrait(ID_A)).toBe(portrait);
    expect(library.entries[0]?.portrait).toBe(portrait);
  });

  it('knows which characters have an open sheet', async () => {
    await repository.save(docFor(ID_A, 'Sable'));
    const library = libraryOver(repository);
    await library.load();
    const opened = await library.entries[0]!.open();
    if (!opened.ok) throw new Error(opened.message);

    expect(library.isOpen(ID_A)).toBe(true);
    expect(library.isOpen(ID_B)).toBe(false);
    opened.sheet.dispose();
    expect(library.isOpen(ID_A)).toBe(false);
  });

  it('refuses to replace a character whose sheet is open, which would autosave over it', async () => {
    await repository.save(docFor(ID_A, 'Sable'));
    const library = libraryOver(repository);
    await library.load();
    const opened = await library.entries[0]!.open();
    if (!opened.ok) throw new Error(opened.message);

    await expect(library.restore(docFor(ID_A, 'Restored'), null)).rejects.toThrow(/open/);
    opened.sheet.dispose();
  });
});
