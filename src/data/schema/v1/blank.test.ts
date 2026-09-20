import { describe, expect, it } from 'vitest';
import { createCharacter } from './blank.js';
import {
  ABILITY_KEYS,
  SKILL_KEYS,
  SPELL_SLOT_LEVELS,
  characterDocumentV1Schema,
  type CharacterDocumentV1,
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
    expect(createCharacter(INPUT).classes).toEqual([]);
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

  // The two tests above only check *which* keys exist and that three aggregate numbers are
  // zero. Neither closes over the per-key value of every ability, skill and spell-slot entry —
  // schema validation alone does not either, since it enforces types, not values. A stray
  // `true`, or a non-zero modifier on a single key, would pass every test above. Assert every
  // key explicitly rather than a sampled one.

  it('zeroes every ability entry, not just a sample', () => {
    const doc = createCharacter(INPUT);
    for (const key of ABILITY_KEYS) {
      expect(doc.abilitiesAndSkills.abilities[key]).toEqual({
        score: 0,
        modifier: 0,
        savingThrowModifier: 0,
        savingThrowProficient: false,
      });
    }
  });

  it('zeroes every skill entry, not just a sample', () => {
    const doc = createCharacter(INPUT);
    for (const key of SKILL_KEYS) {
      expect(doc.abilitiesAndSkills.skills[key]).toEqual({
        modifier: 0,
        proficient: false,
        expertise: false,
      });
    }
  });

  it('zeroes every spell-slot level, not just a sample', () => {
    const doc = createCharacter(INPUT);
    for (const level of SPELL_SLOT_LEVELS) {
      expect(doc.counters.spellSlots[level]).toEqual({ current: 0, total: 0 });
    }
  });

  describe('does not share substructure between documents', () => {
    // Task 3's fixture had a single shared object sitting behind every spell-slot entry, so a
    // mutation on one slot silently poisoned the rest of module state. Tasks 5-7 all build their
    // fixtures on this factory, so a regression here would surface as confusing failures
    // somewhere else entirely. Every mutable location gets its own case below rather than
    // trusting one sampled field (inventory.items) to stand in for the rest.
    const cases: Array<{
      name: string;
      mutate: (doc: CharacterDocumentV1) => void;
      read: (doc: CharacterDocumentV1) => unknown;
      original: unknown;
    }> = [
      {
        name: 'inventory.items',
        mutate: (doc) => doc.inventory.items.push({ name: 'Rope', description: '', count: 1 }),
        read: (doc) => doc.inventory.items,
        original: [],
      },
      {
        name: 'inventory.coins',
        mutate: (doc) => {
          doc.inventory.coins.pp = 5;
        },
        read: (doc) => doc.inventory.coins.pp,
        original: 0,
      },
      {
        name: 'hitPoints',
        mutate: (doc) => {
          doc.hitPoints.current = 5;
        },
        read: (doc) => doc.hitPoints,
        original: { current: 0, total: 0, temporary: 0 },
      },
      {
        name: 'hitDices',
        mutate: (doc) => {
          doc.hitDices['6'] = { current: 1, total: 1 };
        },
        read: (doc) => doc.hitDices,
        original: {},
      },
      {
        name: 'classes',
        mutate: (doc) => {
          doc.classes.push({
            id: '11111111-1111-4111-8111-111111111111',
            name: 'Wizard',
            level: 1,
          });
        },
        read: (doc) => doc.classes,
        original: [],
      },
      {
        name: 'journalAndNotes.journal',
        mutate: (doc) => doc.journalAndNotes.journal.push('an entry'),
        read: (doc) => doc.journalAndNotes.journal,
        original: [],
      },
      {
        name: 'equipment.weapons',
        mutate: (doc) =>
          doc.equipment.weapons.push({
            name: 'Sword',
            description: '',
            attuned: false,
            equipped: false,
          }),
        read: (doc) => doc.equipment.weapons,
        original: [],
      },
      {
        name: 'equipment.other',
        mutate: (doc) =>
          doc.equipment.other.push({
            name: 'Torch',
            description: '',
            attuned: false,
            equipped: false,
          }),
        read: (doc) => doc.equipment.other,
        original: [],
      },
      {
        name: 'featsAndTraits.uncategorized',
        mutate: (doc) =>
          doc.featsAndTraits.uncategorized.push({ name: 'Darkvision', description: '' }),
        read: (doc) => doc.featsAndTraits.uncategorized,
        original: [],
      },
      {
        name: 'featsAndTraits.categories',
        mutate: (doc) => {
          doc.featsAndTraits.categories['Racial'] = [];
        },
        read: (doc) => doc.featsAndTraits.categories,
        original: {},
      },
      {
        name: 'spellList.uncategorized',
        mutate: (doc) =>
          doc.spellList.uncategorized.push({
            name: 'Fireball',
            description: '',
            level: 3,
            prepared: false,
          }),
        read: (doc) => doc.spellList.uncategorized,
        original: [],
      },
      {
        name: 'spellList.categories',
        mutate: (doc) => {
          doc.spellList.categories['Evocation'] = [];
        },
        read: (doc) => doc.spellList.categories,
        original: {},
      },
      {
        name: 'counters.uncategorized',
        mutate: (doc) =>
          doc.counters.uncategorized.push({ name: 'Ki', description: '', current: 0, total: 0 }),
        read: (doc) => doc.counters.uncategorized,
        original: [],
      },
      {
        name: 'counters.categories',
        mutate: (doc) => {
          doc.counters.categories['Class'] = [];
        },
        read: (doc) => doc.counters.categories,
        original: {},
      },
      {
        name: 'counters.spellSlots',
        mutate: (doc) => {
          doc.counters.spellSlots['1'].current = 5;
        },
        read: (doc) => doc.counters.spellSlots['1'],
        original: { current: 0, total: 0 },
      },
      {
        name: 'abilitiesAndSkills.abilities',
        mutate: (doc) => {
          doc.abilitiesAndSkills.abilities.strength.score = 5;
        },
        read: (doc) => doc.abilitiesAndSkills.abilities.strength,
        original: { score: 0, modifier: 0, savingThrowModifier: 0, savingThrowProficient: false },
      },
      {
        name: 'abilitiesAndSkills.skills',
        mutate: (doc) => {
          doc.abilitiesAndSkills.skills.acrobatics.modifier = 5;
        },
        read: (doc) => doc.abilitiesAndSkills.skills.acrobatics,
        original: { modifier: 0, proficient: false, expertise: false },
      },
    ];

    for (const { name, mutate, read, original } of cases) {
      it(`independent ${name}`, () => {
        const first = createCharacter(INPUT);
        const second = createCharacter(INPUT);
        mutate(first);
        expect(read(second)).toEqual(original);
      });
    }
  });
});
