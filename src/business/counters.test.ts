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

  it('starts a new counter at a step of 1, last in the stored counter', () => {
    const sheet = sheetFor();
    sheet.counters.add({ name: 'Rage' });
    const [stored] = sheet.toDocument().counters.uncategorized;
    expect(stored?.step).toBe(1);
    expect(Object.keys(stored ?? {}).at(-1)).toBe('step');
  });

  it('counts in parts: a fractional step, remaining and total reach the document', () => {
    const sheet = sheetFor();
    const oil = sheet.counters.add({ name: 'Lantern oil' });
    oil.setStep(0.5);
    oil.setTotal(6);
    oil.setCurrent(4.5);
    expect([oil.step, oil.total, oil.current]).toEqual([0.5, 6, 4.5]);
    expect(sheet.toDocument().counters.uncategorized[0]).toMatchObject({
      current: 4.5,
      total: 6,
      step: 0.5,
    });
  });

  it.each([0, -0.5])('rejects a step of %j as NOT_POSITIVE', (value) => {
    const counter = sheetFor().counters.add({ name: 'Rage' });
    expect(() => counter.setStep(value)).toThrow(
      expect.objectContaining({ code: 'NOT_POSITIVE' }) as Error,
    );
  });

  it('rejects a fourth decimal place anywhere as TOO_PRECISE', () => {
    const counter = sheetFor().counters.add({ name: 'Rage' });
    for (const write of [
      () => counter.setStep(0.0001),
      () => counter.setCurrent(1.0005),
      () => counter.setTotal(2.0005),
    ]) {
      expect(write).toThrow(expect.objectContaining({ code: 'TOO_PRECISE' }) as Error);
    }
  });

  // Not a rule: the player types what the table says.
  it('does not tie remaining or total to the step', () => {
    const counter = sheetFor().counters.add({ name: 'Rage' });
    counter.setStep(0.5);
    counter.setCurrent(0.3);
    expect(counter.current).toBe(0.3);
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

  it('writes through a SpellSlotBO to the saved document', () => {
    const sheet = sheetFor();
    sheet.counters.spellSlots[4]?.setTotal(7);

    expect(sheet.toDocument().counters.spellSlots['5']).toEqual({ current: 0, total: 7 });
  });
});

describe('pact slots', () => {
  it('start with none, at level 1', () => {
    const pact = sheetFor().counters.pactSlots;
    expect([pact.level, pact.current, pact.total]).toEqual([1, 0, 0]);
  });

  it('write their level, remaining and total to the saved document', () => {
    const sheet = sheetFor();
    const pact = sheet.counters.pactSlots;
    pact.setLevel(3);
    pact.setTotal(2);
    pact.setCurrent(1);
    expect(sheet.toDocument().counters.pactSlots).toEqual({ level: 3, current: 1, total: 2 });
  });

  // SpellSlotBO keeps the level it was constructed with, because an ordinary level is its key.
  // A pact level changes, so a held object must read it from the document every time.
  it('read the level from the document, not from when they were handed out', () => {
    const sheet = sheetFor();
    const held = sheet.counters.pactSlots;
    sheet.counters.pactSlots.setLevel(5);
    expect(held.level).toBe(5);
  });

  it('leave the ordinary slots alone', () => {
    const sheet = sheetFor();
    sheet.counters.pactSlots.setTotal(2);
    expect(Object.values(sheet.toDocument().counters.spellSlots)).toEqual(
      Array.from({ length: 9 }, () => ({ current: 0, total: 0 })),
    );
  });

  it('accept every level from 1 to 9', () => {
    const pact = sheetFor().counters.pactSlots;
    for (const level of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      pact.setLevel(level);
      expect(pact.level).toBe(level);
    }
  });

  it.each([0, 10, 2.5, -1, Number.NaN])('reject level %j as INVALID_SLOT_LEVEL', (value) => {
    expect(() => sheetFor().counters.pactSlots.setLevel(value)).toThrow(
      expect.objectContaining({ code: 'INVALID_SLOT_LEVEL' }) as Error,
    );
  });
});

// What both kinds share, stated once: a pact slot is a spell slot whose level it chooses.
describe.each([
  ['an ordinary level', () => sheetFor().counters.spellSlots[2]!],
  ['pact slots', () => sheetFor().counters.pactSlots],
])('%s, like any slot,', (_kind, slotOf) => {
  it('rejects a negative or fractional count', () => {
    const slot = slotOf();
    expect(() => slot.setCurrent(-1)).toThrow(
      expect.objectContaining({ code: 'NEGATIVE' }) as Error,
    );
    expect(() => slot.setTotal(1.5)).toThrow(
      expect.objectContaining({ code: 'NOT_AN_INTEGER' }) as Error,
    );
  });

  // No `current <= total` rule: the app never clamps what the player has left.
  it('leaves remaining alone when the total changes', () => {
    const slot = slotOf();
    slot.setTotal(2);
    slot.setCurrent(2);
    slot.setTotal(1);
    expect(slot.current).toBe(2);
  });
});
