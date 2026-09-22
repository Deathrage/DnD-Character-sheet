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

describe('CountersBO', () => {
  it('defaults a new counter to zero and zero', () => {
    const counter = sheetFor().counters.add({ name: 'Rage' });
    expect([counter.current, counter.total]).toEqual([0, 0]);
  });

  it('rejects a negative current', () => {
    const counter = sheetFor().counters.add({ name: 'Rage' });
    expect(() => counter.setCurrent(-1)).toThrow(
      expect.objectContaining({ code: 'NEGATIVE' }) as Error,
    );
  });

  it('supports categories, because it uses the same generic', () => {
    const sheet = sheetFor();
    const features = sheet.counters.createCategory('Class features');
    features.add({ name: 'Rage' });

    expect(features.items.map((item) => item.name)).toEqual(['Rage']);
  });
});

describe('spell slots', () => {
  it('exposes exactly nine levels, 1 through 9, in order', () => {
    expect(sheetFor().counters.spellSlots.map((slot) => slot.level)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
  });

  it('starts every level at zero', () => {
    const slots = sheetFor().counters.spellSlots;
    expect(slots.every((slot) => slot.current === 0 && slot.total === 0)).toBe(true);
  });

  it('writes a level independently of the others', () => {
    const sheet = sheetFor();
    sheet.counters.spellSlots[2]?.setTotal(3);

    const { spellSlots } = sheet.toDocument().counters;
    expect(spellSlots['3']).toEqual({ current: 0, total: 3 });
    expect(spellSlots['4']).toEqual({ current: 0, total: 0 });
  });

  // The nine are fixed, so `spellSlots` must hand back a view built on demand rather than an
  // array a caller could grow or shrink. Asserting the absence of an `addSpellSlot` method used
  // to stand here, but no such method ever existed or could: that assertion could not fail.
  it('offers no way to add or remove a level, because the nine are fixed', () => {
    const sheet = sheetFor();
    const slots = sheet.counters.spellSlots;
    expect(slots.map((slot) => slot.level)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);

    slots.pop();

    expect(sheet.counters.spellSlots).toHaveLength(9);
    expect(Object.keys(sheet.toDocument().counters.spellSlots)).toHaveLength(9);
  });

  it('rejects a negative value', () => {
    const slot = sheetFor().counters.spellSlots[0];
    expect(() => slot?.setCurrent(-1)).toThrow(
      expect.objectContaining({ code: 'NEGATIVE' }) as Error,
    );
  });

  it('writes through a SpellSlotBO to the saved document', () => {
    const sheet = sheetFor();
    sheet.counters.spellSlots[4]?.setTotal(7);

    expect(sheet.toDocument().counters.spellSlots['5']).toEqual({ current: 0, total: 7 });
  });
});
