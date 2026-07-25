// Schema v1 is frozen: these tests lock in what a v1 character document was allowed to be.
// Editing an assertion here to let new code pass is editing v1's meaning — see
// ../README.md#when-the-freeze-begins for what "frozen" means and when it starts applying.

import { describe, expect, it } from 'vitest';
import {
  ABILITY_KEYS,
  SKILL_KEYS,
  SPELL_SLOT_LEVELS,
  characterDocumentV1Schema,
} from './document.js';

/**
 * A fresh `{ current: 0, total: 0 }` object every call. Must not be a shared constant: several
 * fixture fields (below, `spellSlots`) place the same call's result at multiple keys, and a
 * table case mutates one of those in place. A single shared object there would let that
 * mutation leak into every other slot, and into every document any later test builds.
 */
function zero() {
  return { current: 0, total: 0 };
}

function validDocument() {
  return {
    schemaVersion: 1 as const,
    id: '3f1a6c2e-8b4d-4a19-9c7e-1d2b3a4c5d6e',
    name: 'Sable Nightwind',
    updatedAt: '2026-07-25T09:41:00.000Z',
    classes: {
      Rogue: { name: 'Rogue', level: 5 },
      Wizard: { name: 'Wizard', level: 2 },
    },
    hitPoints: { current: 38, total: 45, temporary: 5 },
    hitDices: { '8': { current: 3, total: 5 }, '6': { current: 2, total: 2 } },
    armorClass: 15,
    journalAndNotes: { journal: ['Arrived in Barovia.'], notes: 'Find the Sunsword.' },
    inventory: {
      coins: { pp: 2, gp: 84, ep: 0, sp: 37, cp: 12 },
      items: [{ name: "Thieves' Tools", description: 'For locks and traps.', count: 1 }],
    },
    featsAndTraits: {
      categories: { Rogue: [{ name: 'Sneak Attack', description: '+3d6.' }] },
      uncategorized: [{ name: 'Darkvision', description: '60 ft.' }],
    },
    equipment: {
      weapons: [{ name: 'Rapier', description: '1d8 piercing.', attuned: false, equipped: true }],
      other: [
        {
          name: 'Cloak of Elvenkind',
          description: 'Advantage on Stealth.',
          attuned: true,
          equipped: true,
        },
      ],
    },
    spellList: {
      categories: {
        Combat: [{ name: 'Fireball', description: '8d6 fire.', level: 3, prepared: true }],
      },
      uncategorized: [{ name: 'Fire Bolt', description: '2d10 fire.', level: 'c', prepared: true }],
    },
    counters: {
      spellSlots: Object.fromEntries(SPELL_SLOT_LEVELS.map((level) => [level, zero()])),
      categories: {
        'Class Features': [
          { name: 'Arcane Recovery', description: 'Once per day.', current: 1, total: 1 },
        ],
      },
      uncategorized: [],
    },
    abilitiesAndSkills: {
      proficiencyBonus: 3,
      passivePerception: 14,
      speed: 30,
      abilities: Object.fromEntries(
        ABILITY_KEYS.map((key) => [
          key,
          { score: 10, modifier: 0, savingThrowModifier: 0, savingThrowProficient: false },
        ]),
      ),
      skills: Object.fromEntries(
        SKILL_KEYS.map((key) => [key, { modifier: 0, proficient: false, expertise: false }]),
      ),
    },
  };
}

describe('characterDocumentV1Schema', () => {
  it('accepts a complete valid document', () => {
    expect(characterDocumentV1Schema.safeParse(validDocument()).success).toBe(true);
  });

  it('requires schemaVersion to be exactly 1', () => {
    const doc = { ...validDocument(), schemaVersion: 2 };
    expect(characterDocumentV1Schema.safeParse(doc).success).toBe(false);
  });

  it('rejects an unknown top-level key, so typos surface instead of being dropped', () => {
    const doc = { ...validDocument(), levl: 7 };
    expect(characterDocumentV1Schema.safeParse(doc).success).toBe(false);
  });

  it('rejects a stored `level`, because it is derived and must never be persisted', () => {
    const doc = { ...validDocument(), level: 7 };
    expect(characterDocumentV1Schema.safeParse(doc).success).toBe(false);
  });

  it('rejects a class whose map key disagrees with its name (spec §3.3)', () => {
    const doc = validDocument();
    doc.classes = { Rogue: { name: 'Wizard', level: 5 } } as never;
    const result = characterDocumentV1Schema.safeParse(doc);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/key/i);
    }
  });

  it('rejects a hit-dice key that is not a die size', () => {
    const doc = validDocument();
    doc.hitDices = { d8: { current: 1, total: 1 } } as never;
    expect(characterDocumentV1Schema.safeParse(doc).success).toBe(false);
  });

  it('accepts "c" and 1 through 9 as spell levels, and rejects 0 and 10', () => {
    for (const level of ['c', 1, 5, 9]) {
      const doc = validDocument();
      doc.spellList.uncategorized[0]!.level = level as never;
      expect(characterDocumentV1Schema.safeParse(doc).success).toBe(true);
    }
    for (const level of [0, 10, '3']) {
      const doc = validDocument();
      doc.spellList.uncategorized[0]!.level = level as never;
      expect(characterDocumentV1Schema.safeParse(doc).success).toBe(false);
    }
  });

  it('requires all nine spell-slot levels', () => {
    const doc = validDocument();
    delete (doc.counters.spellSlots as Record<string, unknown>)['9'];
    expect(characterDocumentV1Schema.safeParse(doc).success).toBe(false);
  });

  it('requires all six abilities and all eighteen skills', () => {
    const withoutAbility = validDocument();
    delete (withoutAbility.abilitiesAndSkills.abilities as Record<string, unknown>).charisma;
    expect(characterDocumentV1Schema.safeParse(withoutAbility).success).toBe(false);

    const withoutSkill = validDocument();
    delete (withoutSkill.abilitiesAndSkills.skills as Record<string, unknown>).survival;
    expect(characterDocumentV1Schema.safeParse(withoutSkill).success).toBe(false);
  });

  it('rejects a `proficient` flag on an ability, which was dropped (spec §3.1)', () => {
    const doc = validDocument();
    (doc.abilitiesAndSkills.abilities as Record<string, object>).strength = {
      score: 10,
      modifier: 0,
      savingThrowModifier: 0,
      savingThrowProficient: false,
      proficient: true,
    };
    expect(characterDocumentV1Schema.safeParse(doc).success).toBe(false);
  });

  it('accepts negative modifiers on abilities and skills', () => {
    const doc = validDocument();
    (doc.abilitiesAndSkills.abilities as Record<string, { modifier: number }>).strength!.modifier =
      -1;
    (doc.abilitiesAndSkills.skills as Record<string, { modifier: number }>).stealth!.modifier = -2;
    expect(characterDocumentV1Schema.safeParse(doc).success).toBe(true);
  });

  it('rejects a negative armour class', () => {
    expect(
      characterDocumentV1Schema.safeParse({ ...validDocument(), armorClass: -1 }).success,
    ).toBe(false);
  });

  it('exposes 6 abilities, 18 skills and 9 spell-slot levels', () => {
    expect(ABILITY_KEYS).toHaveLength(6);
    expect(SKILL_KEYS).toHaveLength(18);
    expect(SPELL_SLOT_LEVELS).toHaveLength(9);
  });
});

type Doc = ReturnType<typeof validDocument>;

// Every object schema in the document is `.strict()`, so an unknown key anywhere must be
// rejected, not silently stripped — see the file-level comment in document.ts for why. This
// table is what makes the asymmetry (some schemas strict, others not) impossible to
// reintroduce unnoticed: one case per nested location, each naming the location.
const unknownKeyLocations: Array<[string, (doc: Doc) => void]> = [
  [
    'the document root',
    (doc) => {
      (doc as Record<string, unknown>).extra = 'x';
    },
  ],
  [
    'hitPoints',
    (doc) => {
      (doc.hitPoints as Record<string, unknown>).extra = 'x';
    },
  ],
  [
    'a class entry',
    (doc) => {
      (doc.classes.Rogue as Record<string, unknown>).extra = 'x';
    },
  ],
  [
    'inventory',
    (doc) => {
      (doc.inventory as Record<string, unknown>).extra = 'x';
    },
  ],
  [
    'inventory.coins',
    (doc) => {
      (doc.inventory.coins as Record<string, unknown>).extra = 'x';
    },
  ],
  // Behaviourally redundant with the spell-slot-entry case below — both exercise the same bare
  // `currentAndTotal` instance — but this is the other location where it is used unextended,
  // and it is cheap to keep both.
  [
    'a hit-dice entry',
    (doc) => {
      (doc.hitDices['8'] as Record<string, unknown>).extra = 'x';
    },
  ],
  [
    'an inventory item',
    (doc) => {
      (doc.inventory.items[0]! as Record<string, unknown>).extra = 'x';
    },
  ],
  [
    'an equipment item',
    (doc) => {
      (doc.equipment.weapons[0]! as Record<string, unknown>).extra = 'x';
    },
  ],
  [
    'a spell entry',
    (doc) => {
      (doc.spellList.uncategorized[0]! as Record<string, unknown>).extra = 'x';
    },
  ],
  [
    'a counter entry',
    (doc) => {
      (doc.counters.categories['Class Features'][0]! as Record<string, unknown>).extra = 'x';
    },
  ],
  [
    'a categorized section object',
    (doc) => {
      (doc.featsAndTraits as Record<string, unknown>).extra = 'x';
    },
  ],
  // The only place bare `nameAndDescription` (not `.extend()`-ed) is used as an item schema.
  // Every schema derived via `.extend()` re-applies its own `.strict()` on the clone, so none
  // of those cases can detect nameAndDescription itself losing strictness — this one can.
  [
    'a feats/traits item',
    (doc) => {
      (doc.featsAndTraits.uncategorized[0]! as Record<string, unknown>).extra = 'x';
    },
  ],
  [
    'an ability',
    (doc) => {
      (
        doc.abilitiesAndSkills.abilities as Record<string, Record<string, unknown>>
      ).strength!.extra = 'x';
    },
  ],
  [
    'a skill',
    (doc) => {
      (doc.abilitiesAndSkills.skills as Record<string, Record<string, unknown>>).stealth!.extra =
        'x';
    },
  ],
  [
    'abilitiesAndSkills',
    (doc) => {
      (doc.abilitiesAndSkills as Record<string, unknown>).extra = 'x';
    },
  ],
  [
    'journalAndNotes',
    (doc) => {
      (doc.journalAndNotes as Record<string, unknown>).extra = 'x';
    },
  ],
  // Targets slot '1' specifically, and only slot '1': before the `zero()` fix above, every
  // spell-slot entry was the same shared object, so this case silently mutated all nine.
  [
    "the spell-slot entry at level '1'",
    (doc) => {
      (doc.counters.spellSlots as Record<string, Record<string, unknown>>)['1']!.extra = 'x';
    },
  ],
];

describe('rejects an unknown key at every nested location', () => {
  it.each(unknownKeyLocations)('%s', (_location, injectUnknownKey) => {
    const doc = validDocument();
    injectUnknownKey(doc);
    expect(characterDocumentV1Schema.safeParse(doc).success).toBe(false);
  });
});
