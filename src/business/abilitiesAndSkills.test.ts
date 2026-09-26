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

const ABILITIES = [
  'strength',
  'dexterity',
  'constitution',
  'intelligence',
  'wisdom',
  'charisma',
] as const;

const SKILLS = [
  'acrobatics',
  'animalHandling',
  'arcana',
  'athletics',
  'deception',
  'history',
  'insight',
  'intimidation',
  'investigation',
  'medicine',
  'nature',
  'perception',
  'performance',
  'persuasion',
  'religion',
  'sleightOfHand',
  'stealth',
  'survival',
] as const;

describe('AbilitiesAndSkillsBO', () => {
  it('exposes all six abilities and all eighteen skills', () => {
    const { abilitiesAndSkills } = sheetFor();
    expect(Object.keys(abilitiesAndSkills.abilities)).toEqual([...ABILITIES]);
    expect(Object.keys(abilitiesAndSkills.skills)).toEqual([...SKILLS]);
  });

  it.each([
    ['setProficiencyBonus', 'proficiencyBonus'],
    ['setPassivePerception', 'passivePerception'],
    ['setSpeed', 'speed'],
  ] as const)('%s writes %s', (setter, getter) => {
    const { abilitiesAndSkills } = sheetFor();
    abilitiesAndSkills[setter](3);
    expect(abilitiesAndSkills[getter]).toBe(3);
  });

  it.each(['setProficiencyBonus', 'setPassivePerception', 'setSpeed'] as const)(
    '%s rejects a negative',
    (setter) => {
      const { abilitiesAndSkills } = sheetFor();
      expect(() => abilitiesAndSkills[setter](-1)).toThrow(
        expect.objectContaining({ code: 'NEGATIVE' }) as Error,
      );
    },
  );

  // Initiative is a modifier, so unlike its three neighbours above it is signed.
  it('setInitiative writes initiative, a negative one included', () => {
    const { abilitiesAndSkills } = sheetFor();
    abilitiesAndSkills.setInitiative(5);
    expect(abilitiesAndSkills.initiative).toBe(5);
    abilitiesAndSkills.setInitiative(-1);
    expect(abilitiesAndSkills.initiative).toBe(-1);
  });

  it('setInitiative rejects a fraction', () => {
    const { abilitiesAndSkills } = sheetFor();
    expect(() => abilitiesAndSkills.setInitiative(1.5)).toThrow(
      expect.objectContaining({ code: 'NOT_AN_INTEGER' }) as Error,
    );
  });

  it('never derives initiative from Dexterity', () => {
    const { abilitiesAndSkills } = sheetFor();
    abilitiesAndSkills.abilities.dexterity.setModifier(3);
    expect(abilitiesAndSkills.initiative).toBe(0);
  });

  it('writes initiative through to the saved document', () => {
    const sheet = sheetFor();
    sheet.abilitiesAndSkills.setInitiative(7);
    expect(sheet.toDocument().abilitiesAndSkills.initiative).toBe(7);
  });
});

describe('AbilityBO', () => {
  it.each(ABILITIES)('%s writes its four fields independently', (key) => {
    const { abilities } = sheetFor().abilitiesAndSkills;
    const ability = abilities[key];

    ability.setScore(16);
    ability.setModifier(3);
    ability.setSavingThrowModifier(5);
    ability.setSavingThrowProficient(true);

    expect([
      ability.score,
      ability.modifier,
      ability.savingThrowModifier,
      ability.savingThrowProficient,
    ]).toEqual([16, 3, 5, true]);
  });

  it('writes one ability without touching another', () => {
    const { abilities } = sheetFor().abilitiesAndSkills;
    abilities.strength.setScore(16);
    expect(abilities.dexterity.score).toBe(0);
  });

  // Modifiers are the only signed fields in the document (spec section 3.3). They are entered
  // by the player, never computed from the score — the app computes nothing.
  it('accepts a negative modifier, which is the only signed field family', () => {
    const { abilities } = sheetFor().abilitiesAndSkills;
    abilities.strength.setModifier(-1);
    expect(abilities.strength.modifier).toBe(-1);
  });

  it('rejects a negative score, which is not signed', () => {
    const { abilities } = sheetFor().abilitiesAndSkills;
    expect(() => abilities.strength.setScore(-1)).toThrow(
      expect.objectContaining({ code: 'NEGATIVE' }) as Error,
    );
  });

  it('never derives the modifier from the score', () => {
    const { abilities } = sheetFor().abilitiesAndSkills;
    abilities.strength.setScore(16);
    expect(abilities.strength.modifier).toBe(0);
  });

  it('has no ability-check proficiency flag, which was dropped as having no referent', () => {
    const { abilities } = sheetFor().abilitiesAndSkills;
    expect(abilities.strength).not.toHaveProperty('proficient');
    expect(abilities.strength).not.toHaveProperty('setProficient');
  });

  it('writes through to the saved document', () => {
    const sheet = sheetFor();
    sheet.abilitiesAndSkills.abilities.strength.setScore(16);
    sheet.abilitiesAndSkills.abilities.strength.setModifier(-1);

    expect(sheet.toDocument().abilitiesAndSkills.abilities.strength).toEqual({
      score: 16,
      modifier: -1,
      savingThrowModifier: 0,
      savingThrowProficient: false,
    });
  });
});

describe('SkillBO', () => {
  it.each(SKILLS)('%s writes its three fields independently', (key) => {
    const { skills } = sheetFor().abilitiesAndSkills;
    const skill = skills[key];

    skill.setModifier(3);
    skill.setProficient(true);
    skill.setExpertise(true);

    expect([skill.modifier, skill.proficient, skill.expertise]).toEqual([3, true, true]);
  });

  it('accepts a negative modifier', () => {
    const { skills } = sheetFor().abilitiesAndSkills;
    skills.stealth.setModifier(-2);
    expect(skills.stealth.modifier).toBe(-2);
  });

  it('rejects a non-integer modifier', () => {
    const { skills } = sheetFor().abilitiesAndSkills;
    expect(() => skills.stealth.setModifier(1.5)).toThrow(
      expect.objectContaining({ code: 'NOT_AN_INTEGER' }) as Error,
    );
  });

  it('writes through to the saved document', () => {
    const sheet = sheetFor();
    sheet.abilitiesAndSkills.skills.stealth.setProficient(true);

    expect(sheet.toDocument().abilitiesAndSkills.skills.stealth).toEqual({
      modifier: 0,
      proficient: true,
      expertise: false,
    });
  });
});
