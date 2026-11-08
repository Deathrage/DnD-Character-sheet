import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA, createCharacter } from '../data/schema/index.js';
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

const code = (write: () => void): string | undefined => {
  try {
    write();
  } catch (error) {
    return error instanceof RuleViolation ? error.code : undefined;
  }
  return undefined;
};

const ZERO = { score: 0, modifier: 0, savingThrowModifier: 0 };

describe('CompanionsBO.add', () => {
  it('adds a blank companion that satisfies the schema', () => {
    const sheet = sheetFor();
    sheet.companions.add('Owl');
    const doc = sheet.toDocument();
    expect(CURRENT_SCHEMA.safeParse(doc).success).toBe(true);
    expect(doc.companions[0]).toEqual({
      id: expect.any(String) as string,
      name: 'Owl',
      hitPoints: { current: 0, total: 0, temporary: 0 },
      hitDices: null,
      armorClass: 0,
      initiative: null,
      abilities: {
        strength: ZERO,
        dexterity: ZERO,
        constitution: ZERO,
        intelligence: ZERO,
        wisdom: ZERO,
        charisma: ZERO,
      },
      description: '',
      counters: [],
    });
  });

  it('trims the name and allows a repeated one', () => {
    const sheet = sheetFor();
    sheet.companions.add('Skeleton');
    sheet.companions.add('Skeleton');
    sheet.companions.add(' Owl ');
    expect(sheet.companions.items.map((c) => c.name)).toEqual(['Skeleton', 'Skeleton', 'Owl']);
  });

  it('rejects an empty or overlong name', () => {
    const sheet = sheetFor();
    expect(code(() => sheet.companions.add('  '))).toBe('EMPTY_NAME');
    expect(code(() => sheet.companions.add('x'.repeat(81)))).toBe('TOO_LONG');
  });
});

describe('CompanionBO initiative', () => {
  it('switches initiative on at +0, keeps it when switched on again, forgets it when off', () => {
    const owl = sheetFor().companions.add('Owl');
    expect(owl.initiative).toBeNull();
    owl.setRollsInitiative(true);
    expect(owl.initiative).toBe(0);
    owl.setInitiative(4);
    owl.setRollsInitiative(true);
    expect(owl.initiative).toBe(4);
    owl.setRollsInitiative(false);
    expect(owl.initiative).toBeNull();
    owl.setRollsInitiative(true);
    expect(owl.initiative).toBe(0);
  });

  it('sets initiative while on, and throws NO_INITIATIVE while off, after the integer check', () => {
    const owl = sheetFor().companions.add('Owl');
    expect(code(() => owl.setInitiative(1.5))).toBe('NOT_AN_INTEGER');
    expect(code(() => owl.setInitiative(3))).toBe('NO_INITIATIVE');
    owl.setRollsInitiative(true);
    owl.setInitiative(-2);
    expect(owl.initiative).toBe(-2);
  });
});

describe('CompanionBO hit dice', () => {
  it('switches hit dice on with none, keeps the dice when switched on again, clears them when off', () => {
    const owl = sheetFor().companions.add('Owl');
    expect(owl.hitDices).toBeNull();
    owl.setHasHitDices(true);
    expect(owl.hitDices?.items).toEqual([]);
    owl.hitDices?.add(4);
    owl.setHasHitDices(true);
    expect(owl.hitDices?.items.map((d) => d.size)).toEqual([4]);
    owl.setHasHitDices(false);
    expect(owl.hitDices).toBeNull();
  });

  it('adds a die after switching off and on, and the die is in the document', () => {
    const sheet = sheetFor();
    const owl = sheet.companions.add('Owl');
    owl.setHasHitDices(true);
    owl.hitDices?.add(4);
    owl.setHasHitDices(false);
    owl.setHasHitDices(true);
    owl.hitDices?.add(6);
    expect(sheet.toDocument().companions[0]?.hitDices).toEqual({
      '6': { current: 0, total: 0 },
    });
  });

  it('a hit dice object held across off and on writes to the live record', () => {
    const sheet = sheetFor();
    const owl = sheet.companions.add('Owl');
    owl.setHasHitDices(true);
    const held = owl.hitDices;
    owl.setHasHitDices(false);
    owl.setHasHitDices(true);
    held?.add(8);
    expect(sheet.toDocument().companions[0]?.hitDices).toEqual({
      '8': { current: 0, total: 0 },
    });
  });

  it('a hit dice object held while off throws GONE', () => {
    const owl = sheetFor().companions.add('Owl');
    owl.setHasHitDices(true);
    const held = owl.hitDices;
    owl.setHasHitDices(false);
    expect(code(() => held?.add(8))).toBe('GONE');
  });
});

describe('CompanionBO removal and counters', () => {
  it('adding a die or a counter to a removed companion throws GONE', () => {
    const owl = sheetFor().companions.add('Owl');
    owl.setHasHitDices(true);
    const dice = owl.hitDices;
    owl.remove();
    expect(code(() => dice?.add(6))).toBe('GONE');
    expect(code(() => owl.counters.add({ name: 'Bites' }))).toBe('GONE');
    expect(code(() => owl.remove())).toBe('GONE');
  });

  it('companion counters guard like character counters', () => {
    const owl = sheetFor().companions.add('Owl');
    const counter = owl.counters.add({ name: ' Bites ' });
    expect([counter.name, counter.current, counter.total, counter.step]).toEqual([
      'Bites',
      0,
      0,
      1,
    ]);
    expect(code(() => counter.setStep(0))).toBe('NOT_POSITIVE');
    expect(code(() => counter.setStep(1.0005))).toBe('TOO_PRECISE');
    expect(code(() => counter.setCurrent(-1))).toBe('NEGATIVE');
    counter.setStep(0.125);
    counter.setTotal(6);
    counter.setCurrent(4.5);
    expect(owl.counters.items[0]?.current).toBe(4.5);
  });
});

describe('CompanionBO abilities', () => {
  it('companion abilities have no saving throw proficiency', () => {
    const owl = sheetFor().companions.add('Owl');
    owl.abilities.dexterity.setScore(13);
    owl.abilities.dexterity.setModifier(1);
    owl.abilities.dexterity.setSavingThrowModifier(3);
    expect(owl.abilities.dexterity).not.toHaveProperty('savingThrowProficient');
    expect(owl.abilities.dexterity.savingThrowModifier).toBe(3);
  });
});
