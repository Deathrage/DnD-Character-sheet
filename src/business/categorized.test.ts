import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA, createCharacter } from '../data/schema/index.js';
import { CharacterSheetBO } from './characterSheet.js';

const sheetFor = () =>
  new CharacterSheetBO(
    createCharacter({
      name: 'Sable',
      id: '3f1a6c2e-8b4d-4a19-9c7e-1d2b3a4c5d6e',
      now: new Date('2026-07-25T09:41:00.000Z'),
    }),
  );

describe('CategorizedBO', () => {
  it('starts with no categories and nothing uncategorized', () => {
    const { featsAndTraits } = sheetFor();
    expect(featsAndTraits.categories).toEqual([]);
    expect(featsAndTraits.uncategorized).toEqual([]);
  });

  it('adds an item into uncategorized', () => {
    const { featsAndTraits } = sheetFor();
    const rage = featsAndTraits.add({ name: 'Rage' });

    expect(featsAndTraits.uncategorized.map((item) => item.name)).toEqual(['Rage']);
    expect(rage.name).toBe('Rage');
  });

  it('creates a category, appended last', () => {
    const { featsAndTraits } = sheetFor();
    featsAndTraits.createCategory('Combat');
    featsAndTraits.createCategory('Exploration');

    expect(featsAndTraits.categories.map((c) => c.name)).toEqual(['Combat', 'Exploration']);
  });

  it('rejects a duplicate category name', () => {
    const { featsAndTraits } = sheetFor();
    featsAndTraits.createCategory('Combat');

    expect(() => featsAndTraits.createCategory('Combat')).toThrow(
      expect.objectContaining({ code: 'DUPLICATE_NAME' }) as Error,
    );
  });

  it('rejects an empty category name', () => {
    expect(() => sheetFor().featsAndTraits.createCategory('   ')).toThrow(
      expect.objectContaining({ code: 'EMPTY_NAME' }) as Error,
    );
  });

  // Renaming is now a plain field write. It was a one-pass map rebuild when categories were
  // keyed by name, because re-keying is delete-then-insert and moved the entry last.
  it('renames a category without moving it', () => {
    const { featsAndTraits } = sheetFor();
    const combat = featsAndTraits.createCategory('Combat');
    featsAndTraits.createCategory('Exploration');

    combat.setName('Battle');

    expect(featsAndTraits.categories.map((c) => c.name)).toEqual(['Battle', 'Exploration']);
  });

  it('rejects renaming a category onto another category name', () => {
    const { featsAndTraits } = sheetFor();
    const combat = featsAndTraits.createCategory('Combat');
    featsAndTraits.createCategory('Exploration');

    expect(() => combat.setName('Exploration')).toThrow(
      expect.objectContaining({ code: 'DUPLICATE_NAME' }) as Error,
    );
  });

  it('adds an item directly into a category', () => {
    const { featsAndTraits } = sheetFor();
    const combat = featsAndTraits.createCategory('Combat');
    combat.add({ name: 'Rage' });

    expect(combat.items.map((item) => item.name)).toEqual(['Rage']);
    expect(featsAndTraits.uncategorized).toEqual([]);
  });

  // Deleting a category must not delete a player's entries.
  it("moves a removed category's items to uncategorized", () => {
    const { featsAndTraits } = sheetFor();
    const combat = featsAndTraits.createCategory('Combat');
    combat.add({ name: 'Rage' });
    combat.add({ name: 'Reckless Attack' });

    combat.remove();

    expect(featsAndTraits.categories).toEqual([]);
    expect(featsAndTraits.uncategorized.map((item) => item.name)).toEqual([
      'Rage',
      'Reckless Attack',
    ]);
  });

  it('throws GONE when a category is removed twice', () => {
    const combat = sheetFor().featsAndTraits.createCategory('Combat');
    combat.remove();
    expect(() => combat.remove()).toThrow(expect.objectContaining({ code: 'GONE' }) as Error);
  });

  it('moves an item from uncategorized into a category', () => {
    const { featsAndTraits } = sheetFor();
    const rage = featsAndTraits.add({ name: 'Rage' });
    const combat = featsAndTraits.createCategory('Combat');

    rage.moveTo(combat);

    expect(combat.items.map((item) => item.name)).toEqual(['Rage']);
    expect(featsAndTraits.uncategorized).toEqual([]);
  });

  it('moves an item back out to uncategorized', () => {
    const { featsAndTraits } = sheetFor();
    const combat = featsAndTraits.createCategory('Combat');
    const rage = combat.add({ name: 'Rage' });

    rage.moveTo(null);

    expect(combat.items).toEqual([]);
    expect(featsAndTraits.uncategorized.map((item) => item.name)).toEqual(['Rage']);
  });

  it('moves an item between categories, leaving it in exactly one', () => {
    const { featsAndTraits } = sheetFor();
    const combat = featsAndTraits.createCategory('Combat');
    const social = featsAndTraits.createCategory('Social');
    const rage = combat.add({ name: 'Rage' });

    rage.moveTo(social);

    expect(combat.items).toEqual([]);
    expect(social.items.map((item) => item.name)).toEqual(['Rage']);
  });

  it('keeps the item usable after a move, writing to its new home', () => {
    const { featsAndTraits } = sheetFor();
    const rage = featsAndTraits.add({ name: 'Rage' });
    const combat = featsAndTraits.createCategory('Combat');

    rage.moveTo(combat);
    rage.setDescription('Once per long rest.');

    expect(combat.items[0]?.description).toBe('Once per long rest.');
  });

  // A moved item must know where it now lives. If it kept pointing at the bucket it left,
  // remove() would search the wrong array and throw GONE for an item that is plainly present.
  it('can be removed after being moved', () => {
    const { featsAndTraits } = sheetFor();
    const rage = featsAndTraits.add({ name: 'Rage' });
    const combat = featsAndTraits.createCategory('Combat');

    rage.moveTo(combat);
    rage.remove();

    expect(combat.items).toEqual([]);
    expect(featsAndTraits.uncategorized).toEqual([]);
  });

  it('can be moved twice', () => {
    const { featsAndTraits } = sheetFor();
    const combat = featsAndTraits.createCategory('Combat');
    const social = featsAndTraits.createCategory('Social');
    const rage = featsAndTraits.add({ name: 'Rage' });

    rage.moveTo(combat);
    rage.moveTo(social);

    expect(combat.items).toEqual([]);
    expect(social.items.map((item) => item.name)).toEqual(['Rage']);
  });

  it('writes through to the saved document', () => {
    const sheet = sheetFor();
    const combat = sheet.featsAndTraits.createCategory('Combat');
    combat.add({ name: 'Rage', description: 'Angry.' });
    sheet.featsAndTraits.add({ name: 'Darkvision' });

    const { featsAndTraits } = sheet.toDocument();
    expect(featsAndTraits.categories).toMatchObject([
      { name: 'Combat', items: [{ name: 'Rage', description: 'Angry.' }] },
    ]);
    expect(featsAndTraits.uncategorized).toMatchObject([{ name: 'Darkvision' }]);
  });

  // createCategory pushes a plain object literal, exactly the shape MobX clones on push rather
  // than wiring in place. If the returned CategoryBO wrapped the pre-push literal instead of the
  // stored clone, this rename would land on a detached object and never reach toDocument().
  it('writes a rename made through the returned category through to the saved document', () => {
    const sheet = sheetFor();
    const combat = sheet.featsAndTraits.createCategory('Combat');
    combat.setName('Battle');

    const { featsAndTraits } = sheet.toDocument();
    expect(featsAndTraits.categories[0]?.name).toBe('Battle');
  });

  // A category used to expose its live storage array as `rawItems`, "so moveTo can splice into
  // it" — but a public getter returning the live array lets any caller holding a category push a
  // raw, untrimmed, un-deduplicated, id-less item straight into the document, bypassing every
  // rule this layer enforces. moveTo now reaches storage through a module-private WeakMap instead
  // (see categorized.ts), so no property on a CategoryBO should hand the live array back out.
  it('exposes no property, own or inherited, that hands back its live items array', () => {
    const sheet = sheetFor();
    const combat = sheet.featsAndTraits.createCategory('Combat');
    combat.add({ name: 'Rage' });

    // Every array any getter or own field on `combat` returns — walking the prototype chain, not
    // just Object.keys(), because a getter lives on the prototype and Object.keys() would miss it.
    for (const array of arrayValuedProperties(combat)) {
      // A raw push bypasses trimming, duplicate rejection and id minting on purpose: if this
      // array is the live storage, the document below will show it.
      array.push({ id: 'intruder', name: 'Sneaked in', description: '' });
    }

    expect(sheet.toDocument().featsAndTraits.categories[0]?.items.map((item) => item.name)).toEqual(
      ['Rage'],
    );
  });
});

// Nothing stops a caller from holding an item business object while its category is removed —
// the UI will do exactly that, since removing a category is not a bulk delete and the items it
// held go to uncategorized. Every item object handed out before that call keeps pointing at the
// array the removed category took with it, so acting on that array splices nothing and pushes a
// node the document already holds: the same node twice, a duplicate id, and a document the schema
// rejects — which stops autosave for that character for good.
describe('an item held across its category being removed', () => {
  const held = () => {
    const sheet = sheetFor();
    const { featsAndTraits } = sheet;
    const combat = featsAndTraits.createCategory('Combat');
    const rage = combat.add({ name: 'Rage' });
    combat.remove();
    return { sheet, featsAndTraits, combat, rage };
  };

  it('is rehomed into uncategorized by the removal', () => {
    const { featsAndTraits } = held();
    expect(featsAndTraits.uncategorized.map((item) => item.name)).toEqual(['Rage']);
  });

  it('moves out of where it now lives, landing in the destination exactly once', () => {
    const { sheet, featsAndTraits, rage } = held();
    const social = featsAndTraits.createCategory('Social');

    rage.moveTo(social);

    expect(social.items.map((item) => item.name)).toEqual(['Rage']);
    expect(featsAndTraits.uncategorized).toEqual([]);
    expect(CURRENT_SCHEMA.safeParse(sheet.toDocument()).success).toBe(true);
  });

  it('treats a move to the bucket it was rehomed into as the no-op it is', () => {
    const { sheet, featsAndTraits, rage } = held();

    rage.moveTo(null);

    expect(featsAndTraits.uncategorized.map((item) => item.name)).toEqual(['Rage']);
    expect(CURRENT_SCHEMA.safeParse(sheet.toDocument()).success).toBe(true);
  });

  it('is actually removed by remove(), not spliced out of the orphaned array', () => {
    const { sheet, rage } = held();

    rage.remove();

    expect(sheet.toDocument().featsAndTraits.uncategorized).toEqual([]);
  });

  it('throws GONE once it really is gone', () => {
    const { rage } = held();
    rage.remove();

    expect(() => rage.remove()).toThrow(expect.objectContaining({ code: 'GONE' }) as Error);
    expect(() => rage.moveTo(null)).toThrow(expect.objectContaining({ code: 'GONE' }) as Error);
  });

  it('cannot be moved into the removed category, which is no longer a place', () => {
    const { combat, rage } = held();

    expect(() => rage.moveTo(combat)).toThrow(
      expect.objectContaining({ code: 'UNKNOWN_CATEGORY' }) as Error,
    );
  });

  // add() minted an id and returned a working-looking business object whose item never reached
  // the document — the same existence check setName and remove already made.
  it('refuses an add through the removed category', () => {
    const { sheet, combat } = held();

    expect(() => combat.add({ name: 'Reckless Attack' })).toThrow(
      expect.objectContaining({ code: 'GONE' }) as Error,
    );
    expect(sheet.toDocument().featsAndTraits.uncategorized.map((item) => item.name)).toEqual([
      'Rage',
    ]);
  });
});

/** Every array a getter or own field on `obj`, or its prototype chain, hands back. */
function arrayValuedProperties(obj: object): unknown[][] {
  const arrays: unknown[][] = [];
  let proto: object | null = obj;
  let isOwn = true;
  while (proto !== null && proto !== Object.prototype) {
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === 'constructor') continue;

      const descriptor = Object.getOwnPropertyDescriptor(proto, name);
      if (!descriptor) continue;

      let value: unknown;
      if (typeof descriptor.get === 'function') {
        try {
          value = descriptor.get.call(obj);
        } catch {
          continue;
        }
      } else if (isOwn && 'value' in descriptor && typeof descriptor.value !== 'function') {
        value = descriptor.value;
      } else {
        continue;
      }

      if (Array.isArray(value)) arrays.push(value);
    }
    proto = Object.getPrototypeOf(proto);
    isOwn = false;
  }
  return arrays;
}
