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

describe('CoinsBO', () => {
  it('starts at zero for every denomination', () => {
    const { coins } = sheetFor().inventory;
    expect([coins.pp, coins.gp, coins.ep, coins.sp, coins.cp]).toEqual([0, 0, 0, 0, 0]);
  });

  it.each([
    ['setPp', 'pp'],
    ['setGp', 'gp'],
    ['setEp', 'ep'],
    ['setSp', 'sp'],
    ['setCp', 'cp'],
  ] as const)('%s writes %s', (setter, getter) => {
    const { coins } = sheetFor().inventory;
    coins[setter](5);
    expect(coins[getter]).toBe(5);
  });

  it.each(['setPp', 'setGp', 'setEp', 'setSp', 'setCp'] as const)(
    '%s rejects a negative amount',
    (setter) => {
      const { coins } = sheetFor().inventory;
      expect(() => coins[setter](-1)).toThrow(
        expect.objectContaining({ code: 'NEGATIVE' }) as Error,
      );
    },
  );
});

describe('InventoryBO', () => {
  it('starts with no items', () => {
    expect(sheetFor().inventory.items).toEqual([]);
  });

  it('adds an item with its defaults', () => {
    const item = sheetFor().inventory.add({ name: "Thieves' Tools" });
    expect([item.name, item.description, item.count]).toEqual(["Thieves' Tools", '', 0]);
  });

  it('mints an id for the new item', () => {
    expect(sheetFor().inventory.add({ name: 'Rope' }).id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('mints a different id for each new item', () => {
    const sheet = sheetFor();
    const a = sheet.inventory.add({ name: 'Rope' });
    const b = sheet.inventory.add({ name: 'Rope' });
    expect(a.id).not.toBe(b.id);
  });

  it('trims the name but not the description', () => {
    const item = sheetFor().inventory.add({ name: '  Rope  ', description: '  50 feet  ' });
    expect(item.name).toBe('Rope');
    expect(item.description).toBe('  50 feet  ');
  });

  it('setName trims but setDescription does not', () => {
    const item = sheetFor().inventory.add({ name: 'Rope' });
    item.setName('  Coiled Rope  ');
    item.setDescription('  50 feet  ');
    expect(item.name).toBe('Coiled Rope');
    expect(item.description).toBe('  50 feet  ');
  });

  // Unlike classes and categories, items may repeat a name — two daggers are two daggers.
  it('allows two items to share a name', () => {
    const sheet = sheetFor();
    sheet.inventory.add({ name: 'Dagger' });
    expect(() => sheet.inventory.add({ name: 'Dagger' })).not.toThrow();
  });

  it('rejects a negative count', () => {
    expect(() => sheetFor().inventory.add({ name: 'Rope', count: -1 })).toThrow(
      expect.objectContaining({ code: 'NEGATIVE' }) as Error,
    );
  });

  it('removes an item, leaving the rest in order', () => {
    const sheet = sheetFor();
    const rope = sheet.inventory.add({ name: 'Rope' });
    sheet.inventory.add({ name: 'Torch' });

    rope.remove();

    expect(sheet.inventory.items.map((item) => item.name)).toEqual(['Torch']);
  });

  it('throws GONE when an item is removed twice', () => {
    const rope = sheetFor().inventory.add({ name: 'Rope' });
    rope.remove();
    expect(() => rope.remove()).toThrow(expect.objectContaining({ code: 'GONE' }) as Error);
  });

  it('writes through to the saved document', () => {
    const sheet = sheetFor();
    sheet.inventory.add({ name: 'Rope', count: 1 });
    sheet.inventory.coins.setGp(84);

    const { inventory } = sheet.toDocument();
    expect(inventory.coins.gp).toBe(84);
    expect(inventory.items).toMatchObject([{ name: 'Rope', count: 1 }]);
  });

  /**
   * Guards against the MobX push-clone hazard `pushAndRead` exists to fix: `add()` must build
   * its returned business object from the array's own stored element, not from the plain literal
   * it constructed. A write through the returned object has to land in `toDocument()`, not on a
   * detached copy. Asserting only `add()`'s own return value is not enough — that read the same
   * detached literal it wrote, so it looked correct even while the write never reached the
   * document.
   */
  it('writes made through the object add() returned reach toDocument()', () => {
    const sheet = sheetFor();
    const item = sheet.inventory.add({ name: 'Rope' });
    item.setCount(3);

    const { inventory } = sheet.toDocument();
    expect(inventory.items).toMatchObject([{ name: 'Rope', count: 3 }]);
  });
});
