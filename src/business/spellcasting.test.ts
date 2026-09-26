import { autorun } from 'mobx';
import { describe, expect, it } from 'vitest';
import { createCharacter } from '../data/schema/index.js';
import { CharacterSheetBO } from './characterSheet.js';
import { RuleViolation } from './errors.js';

const sheetFor = () =>
  new CharacterSheetBO(
    createCharacter({
      name: 'Sable',
      id: '3f1a6c2e-8b4d-4a19-9c7e-1d2b3a4c5d6e',
      now: new Date('2026-07-25T09:41:00.000Z'),
    }),
  );

const code = (run: () => void): string | undefined => {
  try {
    run();
  } catch (error) {
    if (error instanceof RuleViolation) return error.code;
    throw error;
  }
  return undefined;
};

describe('SpellcastingBO', () => {
  it('starts empty', () => {
    expect(sheetFor().spellList.spellcasting.items).toEqual([]);
  });

  it('adds an entry with its numbers, readable from the entry and from the document', () => {
    const sheet = sheetFor();
    const entry = sheet.spellList.spellcasting.add('intelligence', { attackBonus: 6, saveDc: 14 });

    expect([entry.ability, entry.attackBonus, entry.saveDc]).toEqual(['intelligence', 6, 14]);
    expect(sheet.toDocument().spellList.spellcasting).toEqual({
      intelligence: { attackBonus: 6, saveDc: 14 },
    });
  });

  it('lists entries STR to CHA, whatever order they were added in', () => {
    const { spellcasting } = sheetFor().spellList;
    spellcasting.add('charisma', { attackBonus: 4, saveDc: 12 });
    spellcasting.add('intelligence', { attackBonus: 6, saveDc: 14 });

    expect(spellcasting.items.map((entry) => entry.ability)).toEqual(['intelligence', 'charisma']);
  });

  it('refuses a second entry for the same ability, leaving the first untouched', () => {
    const sheet = sheetFor();
    sheet.spellList.spellcasting.add('intelligence', { attackBonus: 6, saveDc: 14 });

    expect(
      code(() => sheet.spellList.spellcasting.add('intelligence', { attackBonus: 9, saveDc: 17 })),
    ).toBe('DUPLICATE_SPELLCASTING');
    expect(sheet.toDocument().spellList.spellcasting.intelligence).toEqual({
      attackBonus: 6,
      saveDc: 14,
    });
  });

  it('refuses an ability that is not one of the six', () => {
    const { spellcasting } = sheetFor().spellList;
    expect(code(() => spellcasting.add('luck' as never, { attackBonus: 1, saveDc: 9 }))).toBe(
      'UNKNOWN_ABILITY',
    );
    expect(spellcasting.items).toEqual([]);
  });

  it('refuses a negative save DC and a fractional attack bonus, adding nothing', () => {
    const { spellcasting } = sheetFor().spellList;
    expect(code(() => spellcasting.add('wisdom', { attackBonus: 5, saveDc: -1 }))).toBe('NEGATIVE');
    expect(code(() => spellcasting.add('wisdom', { attackBonus: 1.5, saveDc: 13 }))).toBe(
      'NOT_AN_INTEGER',
    );
    expect(spellcasting.items).toEqual([]);
  });
});

describe('SpellcastingEntryBO', () => {
  it('updates both numbers, and accepts a negative attack bonus', () => {
    const sheet = sheetFor();
    const entry = sheet.spellList.spellcasting.add('wisdom', { attackBonus: 5, saveDc: 13 });

    entry.setAttackBonus(-1);
    entry.setSaveDc(9);

    expect(sheet.toDocument().spellList.spellcasting.wisdom).toEqual({
      attackBonus: -1,
      saveDc: 9,
    });
  });

  it('checks the setters as add does', () => {
    const entry = sheetFor().spellList.spellcasting.add('wisdom', { attackBonus: 5, saveDc: 13 });
    expect(code(() => entry.setAttackBonus(1.5))).toBe('NOT_AN_INTEGER');
    expect(code(() => entry.setSaveDc(-1))).toBe('NEGATIVE');
  });

  it('removes its key, and is GONE afterwards', () => {
    const sheet = sheetFor();
    const entry = sheet.spellList.spellcasting.add('wisdom', { attackBonus: 5, saveDc: 13 });

    entry.remove();

    expect(sheet.toDocument().spellList.spellcasting).toEqual({});
    expect(code(() => entry.remove())).toBe('GONE');
    expect(code(() => entry.setSaveDc(10))).toBe('GONE');
    expect(code(() => entry.attackBonus)).toBe('GONE');
  });

  it('makes an added and a removed key observable, so autosave and the screen see them', () => {
    const { spellcasting } = sheetFor().spellList;
    const seen: number[] = [];
    const stop = autorun(() => seen.push(spellcasting.items.length));

    spellcasting.add('wisdom', { attackBonus: 5, saveDc: 13 }).remove();

    expect(seen).toEqual([0, 1, 0]);
    stop();
  });
});
