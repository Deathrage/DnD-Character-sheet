// A layer-level test, deliberately not colocated with any one module. Every hop in the data
// layer is tested in isolation elsewhere; nothing spanned the chain, so nothing checked that
// the four modules' interfaces actually fit together. This is the cheapest proof that they do,
// and the place a mismatch between two of them shows up first.

import { beforeEach, describe, expect, it } from 'vitest';
import { toJsonText } from './serialization/exportCharacter.js';
import { fromJsonText } from './serialization/importCharacter.js';
import { DB_NAME, createIndexedDbRepository } from './repository/indexedDbRepository.js';
import { createCharacter } from './schema/index.js';

const ORIGINAL_ID = '3f1a6c2e-8b4d-4a19-9c7e-1d2b3a4c5d6e';
const IMPORTED_ID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

async function wipe(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error('deleteDatabase was blocked — a connection was left open by a test'));
  });
}

describe('the character lifecycle, end to end across the data layer', () => {
  beforeEach(wipe);

  it('creates, exports, imports, saves, lists, reads back and deletes', async () => {
    const repository = createIndexedDbRepository();

    // 1. create — schema/v1/blank.ts
    const created = createCharacter({
      name: 'Sable Nightwind',
      id: ORIGINAL_ID,
      now: new Date('2026-07-25T09:41:00.000Z'),
    });
    created.classes = { Rogue: { name: 'Rogue', level: 5 }, Wizard: { name: 'Wizard', level: 2 } };
    created.hitPoints = { current: 38, total: 45, temporary: 5 };
    // Deliberate leading and trailing whitespace in the longText fields, which permit it (only
    // names reject padding). A `.trim()`/`.transform()` added to a primitive later would alter
    // this VALID document somewhere along the chain, and the toEqual assertions below would
    // catch it. With the blank factory's empty strings they could not.
    created.journalAndNotes = {
      journal: ['  Arrived in Barovia.  '],
      notes: '  Find the Sunsword.\n',
    };

    // 2. export — serialization/exportCharacter.ts
    const text = toJsonText(created);

    // 3. import — serialization/importCharacter.ts, via migration/parseCharacter.ts.
    // Import always creates, so it takes a fresh id (spec §5).
    const imported = fromJsonText(text, { assignId: IMPORTED_ID });
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.doc).toEqual({ ...created, id: IMPORTED_ID });

    // 4. save — repository/indexedDbRepository.ts
    await repository.save(imported.doc);

    // 5. list — repository/summarize.ts. totalLevel is derived here and never stored.
    const entries = await repository.list();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.ok).toBe(true);
    if (entries[0]?.ok) {
      expect(entries[0].summary).toEqual({
        id: IMPORTED_ID,
        name: 'Sable Nightwind',
        totalLevel: 7,
        classes: [
          { name: 'Rogue', level: 5 },
          { name: 'Wizard', level: 2 },
        ],
        hitPoints: { current: 38, total: 45, temporary: 5 },
      });
    }

    // 6. get — the round trip must be lossless. toEqual against the imported document is the
    // assertion that would catch any hop quietly altering, defaulting or stripping a field.
    const loaded = await repository.get(IMPORTED_ID);
    expect(loaded?.ok).toBe(true);
    if (loaded?.ok) expect(loaded.doc).toEqual(imported.doc);

    // 7. delete
    await repository.delete(IMPORTED_ID);
    expect(await repository.get(IMPORTED_ID)).toBeNull();
    expect(await repository.list()).toEqual([]);
  });
});
