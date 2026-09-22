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

describe('HitDicesBO', () => {
  it('starts empty', () => {
    expect(sheetFor().hitDices.items).toEqual([]);
  });

  it('adds a die by size, starting at zero', () => {
    const die = sheetFor().hitDices.add(8);
    expect([die.size, die.current, die.total]).toEqual([8, 0, 0]);
  });

  it('rejects a size already present, because the size is the identity', () => {
    const sheet = sheetFor();
    sheet.hitDices.add(8);
    expect(() => sheet.hitDices.add(8)).toThrow(
      expect.objectContaining({ code: 'DUPLICATE_DIE' }) as Error,
    );
  });

  // 1e21 is the one that does not look like a bad size: it is a positive integer, but it
  // stringifies as "1e+21", and the stored key IS the size — so it would put a key in the
  // document that the schema's dieSizeKey rejects, which stops autosave for the character.
  it.each([0, -6, 1.5, 1e21])('rejects %j as a die size', (size) => {
    expect(() => sheetFor().hitDices.add(size)).toThrow(
      expect.objectContaining({ code: 'INVALID_DIE_SIZE' }) as Error,
    );
  });

  // The key is the die size and numeric-like string keys iterate in ascending numeric order,
  // which is exactly the display order a player expects: d4, d6, d8, d12, d20.
  it('lists dice in ascending size regardless of the order they were added', () => {
    const sheet = sheetFor();
    sheet.hitDices.add(12);
    sheet.hitDices.add(6);
    sheet.hitDices.add(20);

    expect(sheet.hitDices.items.map((die) => die.size)).toEqual([6, 12, 20]);
  });

  // The previous case does NOT reliably discriminate `.sort()` being present from absent: any
  // object key that qualifies as an "array index" (an integer string from 0 to 2^32-2, which
  // every realistic die size is) is enumerated by the JS engine in ascending numeric order
  // regardless of insertion order (ECMA-262 [[OwnPropertyKeys]] ordering) — verified directly:
  // `Object.keys({ '12': 1, '6': 1, '20': 1 })` is already `['6', '12', '20']` with no sort
  // involved. So insertion order never disagrees with numeric order for die-sized keys, and no
  // permutation of small sizes can make a missing `.sort()` fail. This case escapes that
  // guarantee with sizes above the array-index ceiling (2^32-2 = 4294967294), where the engine
  // falls back to true insertion order, which genuinely disagrees with numeric order here.
  it('lists dice ascending even for sizes above the array-index range', () => {
    const sheet = sheetFor();
    sheet.hitDices.add(5_000_000_000);
    sheet.hitDices.add(4_300_000_000);

    expect(sheet.hitDices.items.map((die) => die.size)).toEqual([4_300_000_000, 5_000_000_000]);
  });

  it('removes a die, deleting its key entirely', () => {
    const sheet = sheetFor();
    const die = sheet.hitDices.add(8);
    die.remove();

    expect(sheet.hitDices.items).toEqual([]);
    expect(sheet.toDocument().hitDices).toEqual({});
  });

  it('throws GONE when a die is removed twice', () => {
    const die = sheetFor().hitDices.add(8);
    die.remove();
    expect(() => die.remove()).toThrow(expect.objectContaining({ code: 'GONE' }) as Error);
  });

  // This is the bite-proof for the MobX push-clone hazard applied to a Record: `add()` writes a
  // plain object literal into the observable record, which MobX converts into a new proxy at
  // that moment (verified directly: `obs.dice['8'] === literal` is false). If the returned
  // `HitDieBO` held that literal by reference instead of re-resolving by key on every access,
  // these writes would land on the detached literal and never reach `toDocument()` — exactly
  // the bug Task 3 shipped for `ClassesBO.add`, undetected because no test asserted this path.
  it('writes current and total through to the saved document', () => {
    const sheet = sheetFor();
    const die = sheet.hitDices.add(8);
    die.setCurrent(3);
    die.setTotal(5);

    expect(sheet.toDocument().hitDices).toEqual({ '8': { current: 3, total: 5 } });
  });
});
