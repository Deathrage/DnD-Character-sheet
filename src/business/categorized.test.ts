import { describe, expect, it } from 'vitest';
import { createCharacter } from '../data/schema/index.js';
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
});
