import { describe, expect, it } from 'vitest';
import { autorun } from 'mobx';
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

describe('ClassesBO', () => {
  it('starts empty', () => {
    expect(sheetFor().classes.items).toEqual([]);
  });

  it('adds a class and returns it', () => {
    const sheet = sheetFor();
    const rogue = sheet.classes.add({ name: 'Rogue', level: 5 });

    expect(rogue.name).toBe('Rogue');
    expect(rogue.level).toBe(5);
    expect(sheet.classes.items).toHaveLength(1);
  });

  it('mints an id for the new class', () => {
    const rogue = sheetFor().classes.add({ name: 'Rogue' });
    expect(rogue.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('defaults an omitted level to one', () => {
    expect(sheetFor().classes.add({ name: 'Rogue' }).level).toBe(1);
  });

  it('trims the name on add', () => {
    expect(sheetFor().classes.add({ name: '  Rogue  ' }).name).toBe('Rogue');
  });

  it('appends, so display order is creation order', () => {
    const sheet = sheetFor();
    sheet.classes.add({ name: 'Rogue' });
    sheet.classes.add({ name: 'Wizard' });

    expect(sheet.classes.items.map((entry) => entry.name)).toEqual(['Rogue', 'Wizard']);
  });

  // The schema permits two classes with one name so a hand-edited document is never rejected
  // over it. The business layer is where it gets refused — see spec section 2.5.
  it('rejects a duplicate name on add', () => {
    const sheet = sheetFor();
    sheet.classes.add({ name: 'Rogue' });

    expect(() => sheet.classes.add({ name: 'Rogue' })).toThrow(
      expect.objectContaining({ code: 'DUPLICATE_NAME' }) as Error,
    );
  });

  it('compares duplicate names after trimming, so padding cannot smuggle one past', () => {
    const sheet = sheetFor();
    sheet.classes.add({ name: 'Rogue' });

    expect(() => sheet.classes.add({ name: '  Rogue  ' })).toThrow(
      expect.objectContaining({ code: 'DUPLICATE_NAME' }) as Error,
    );
  });

  it.each([0, -1])('rejects a level of %i', (level) => {
    expect(() => sheetFor().classes.add({ name: 'Rogue', level })).toThrow(
      expect.objectContaining({ code: 'BELOW_ONE' }) as Error,
    );
  });

  it('refuses to set a level below one', () => {
    const rogue = sheetFor().classes.add({ name: 'Rogue' });

    expect(() => rogue.setLevel(0)).toThrow(
      expect.objectContaining({ code: 'BELOW_ONE' }) as Error,
    );
    expect(rogue.level).toBe(1);
  });
});

describe('ClassBO', () => {
  it('renames in place, keeping its position', () => {
    const sheet = sheetFor();
    const rogue = sheet.classes.add({ name: 'Rogue' });
    sheet.classes.add({ name: 'Wizard' });

    rogue.setName('Swashbuckler');

    expect(sheet.classes.items.map((entry) => entry.name)).toEqual(['Swashbuckler', 'Wizard']);
  });

  it('rejects a rename onto another class name', () => {
    const sheet = sheetFor();
    const rogue = sheet.classes.add({ name: 'Rogue' });
    sheet.classes.add({ name: 'Wizard' });

    expect(() => rogue.setName('Wizard')).toThrow(
      expect.objectContaining({ code: 'DUPLICATE_NAME' }) as Error,
    );
  });

  it('allows renaming a class to the name it already has', () => {
    const rogue = sheetFor().classes.add({ name: 'Rogue' });
    expect(() => rogue.setName('Rogue')).not.toThrow();
  });

  it('removes itself from the collection', () => {
    const sheet = sheetFor();
    const rogue = sheet.classes.add({ name: 'Rogue' });
    sheet.classes.add({ name: 'Wizard' });

    rogue.remove();

    expect(sheet.classes.items.map((entry) => entry.name)).toEqual(['Wizard']);
  });

  it('throws GONE when removed twice, rather than silently doing nothing', () => {
    const rogue = sheetFor().classes.add({ name: 'Rogue' });
    rogue.remove();

    expect(() => rogue.remove()).toThrow(expect.objectContaining({ code: 'GONE' }) as Error);
  });

  it('feeds the sheet-level derived total', () => {
    const sheet = sheetFor();
    sheet.classes.add({ name: 'Rogue', level: 5 });
    sheet.classes.add({ name: 'Wizard', level: 2 });

    expect(sheet.level).toBe(7);
  });

  it('is observable, so a level change re-runs a reader of the derived total', () => {
    const sheet = sheetFor();
    const rogue = sheet.classes.add({ name: 'Rogue', level: 1 });
    const seen: number[] = [];
    const stop = autorun(() => seen.push(sheet.level));

    rogue.setLevel(3);

    expect(seen).toEqual([1, 3]);
    stop();
  });

  it('writes through to the saved document', () => {
    const sheet = sheetFor();
    sheet.classes.add({ name: 'Rogue', level: 5 });

    expect(sheet.toDocument().classes).toMatchObject([{ name: 'Rogue', level: 5 }]);
  });

  // Regression test: a naive `add()` that pushes a plain literal into the observable array and
  // then keeps wrapping that same literal returns a ClassBO whose writes land on a detached
  // object MobX cloned away from. Every other test here reads back through `.items` or through
  // `sheet.level`/`sheet.toDocument()`, which go straight to the live array and would pass even
  // against that broken version — only a write through the object `add()` itself returned,
  // checked via `toDocument()`, catches it.
  it('writes made through the object add() returned reach the saved document', () => {
    const sheet = sheetFor();
    const rogue = sheet.classes.add({ name: 'Rogue', level: 1 });

    rogue.setLevel(5);

    expect(sheet.toDocument().classes[0]).toMatchObject({ level: 5 });
  });
});
