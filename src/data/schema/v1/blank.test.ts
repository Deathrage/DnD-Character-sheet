import { describe, expect, it } from 'vitest';
import { createCharacter } from './blank.js';
import {
  ABILITY_KEYS,
  SKILL_KEYS,
  SPELL_SLOT_LEVELS,
  characterDocumentV1Schema,
} from './document.js';

const INPUT = {
  name: 'Wren Duskwhisper',
  id: '3f1a6c2e-8b4d-4a19-9c7e-1d2b3a4c5d6e',
  now: new Date('2026-07-25T09:41:00.000Z'),
};

describe('createCharacter', () => {
  it('produces a document that passes the v1 schema', () => {
    const result = characterDocumentV1Schema.safeParse(createCharacter(INPUT));
    expect(result.success).toBe(true);
  });

  it('records the identity it was given', () => {
    const doc = createCharacter(INPUT);
    expect(doc.schemaVersion).toBe(1);
    expect(doc.id).toBe(INPUT.id);
    expect(doc.name).toBe('Wren Duskwhisper');
    expect(doc.updatedAt).toBe('2026-07-25T09:41:00.000Z');
  });

  it('trims the supplied name', () => {
    expect(createCharacter({ ...INPUT, name: '  Wren  ' }).name).toBe('Wren');
  });

  it('starts with no classes, so total level is zero', () => {
    expect(createCharacter(INPUT).classes).toEqual({});
  });

  it('starts every collection empty', () => {
    const doc = createCharacter(INPUT);
    expect(doc.hitDices).toEqual({});
    expect(doc.journalAndNotes).toEqual({ journal: [], notes: '' });
    expect(doc.inventory.items).toEqual([]);
    expect(doc.equipment).toEqual({ weapons: [], other: [] });
    for (const section of [doc.featsAndTraits, doc.spellList, doc.counters]) {
      expect(section.categories).toEqual({});
      expect(section.uncategorized).toEqual([]);
    }
  });

  it('zeroes the numbers rather than guessing at D&D defaults', () => {
    const doc = createCharacter(INPUT);
    expect(doc.hitPoints).toEqual({ current: 0, total: 0, temporary: 0 });
    expect(doc.armorClass).toBe(0);
    expect(doc.inventory.coins).toEqual({ pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 });
    expect(doc.abilitiesAndSkills.proficiencyBonus).toBe(0);
    expect(doc.abilitiesAndSkills.passivePerception).toBe(0);
    expect(doc.abilitiesAndSkills.speed).toBe(0);
  });

  it('includes every ability, skill and spell-slot level', () => {
    const doc = createCharacter(INPUT);
    expect(Object.keys(doc.abilitiesAndSkills.abilities)).toEqual([...ABILITY_KEYS]);
    expect(Object.keys(doc.abilitiesAndSkills.skills)).toEqual([...SKILL_KEYS]);
    expect(Object.keys(doc.counters.spellSlots)).toEqual([...SPELL_SLOT_LEVELS]);
  });

  it('returns independent documents, not shared substructures', () => {
    const first = createCharacter(INPUT);
    const second = createCharacter(INPUT);
    first.inventory.items.push({ name: 'Rope', description: '', count: 1 });
    expect(second.inventory.items).toEqual([]);
  });
});
