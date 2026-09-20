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
    classes: [
      { id: '11111111-1111-4111-8111-111111111111', name: 'Rogue', level: 5 },
      { id: '22222222-2222-4222-8222-222222222222', name: 'Wizard', level: 2 },
    ],
    hitPoints: { current: 38, total: 45, temporary: 5 },
    hitDices: { '8': { current: 3, total: 5 }, '6': { current: 2, total: 2 } },
    armorClass: 15,
    journalAndNotes: { journal: ['Arrived in Barovia.'], notes: 'Find the Sunsword.' },
    inventory: {
      coins: { pp: 2, gp: 84, ep: 0, sp: 37, cp: 12 },
      items: [
        {
          id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          name: "Thieves' Tools",
          description: 'For locks and traps.',
          count: 1,
        },
      ],
    },
    featsAndTraits: {
      categories: [
        {
          id: '66666666-6666-4666-8666-666666666666',
          name: 'Combat',
          items: [
            {
              id: '77777777-7777-4777-8777-777777777777',
              name: 'Sneak Attack',
              description: 'Once per turn.',
            },
          ],
        },
      ],
      uncategorized: [
        {
          id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          name: 'Darkvision',
          description: '60 ft.',
        },
      ],
    },
    equipment: {
      weapons: [
        {
          id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          name: 'Rapier',
          description: '1d8 piercing.',
          attuned: false,
          equipped: true,
        },
      ],
      other: [
        {
          id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
          name: 'Cloak of Elvenkind',
          description: 'Advantage on Stealth.',
          attuned: true,
          equipped: true,
        },
      ],
    },
    spellList: {
      categories: [
        {
          id: '88888888-8888-4888-8888-888888888888',
          name: 'Evocation',
          items: [
            {
              id: '99999999-9999-4999-8999-999999999999',
              name: 'Fire Bolt',
              description: 'A mote of fire.',
              level: 'c' as const,
              prepared: true,
            },
          ],
        },
      ],
      uncategorized: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          name: 'Prestidigitation',
          description: 'A cantrip with no category.',
          level: 'c' as const,
          prepared: false,
        },
      ],
    },
    counters: {
      categories: [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          name: 'Class features',
          items: [
            {
              id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
              name: 'Rage',
              description: 'Per long rest.',
              current: 1,
              total: 3,
            },
          ],
        },
      ],
      uncategorized: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          name: 'Inspiration',
          description: 'Not tied to a category.',
          current: 0,
          total: 1,
        },
      ],
      spellSlots: Object.fromEntries(SPELL_SLOT_LEVELS.map((level) => [level, zero()])),
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

  it('requires an id on every class', () => {
    const doc = validDocument();
    delete (doc.classes[0] as Record<string, unknown>).id;
    expect(characterDocumentV1Schema.safeParse(doc).success).toBe(false);
  });

  it('accepts two classes sharing a name, which the business layer rejects rather than the schema', () => {
    const doc = validDocument();
    doc.classes[1]!.name = 'Rogue';
    expect(characterDocumentV1Schema.safeParse(doc).success).toBe(true);
  });

  it('rejects an invalid item in the uncategorized bucket, not only inside a category', () => {
    const doc = validDocument();
    delete (doc.featsAndTraits.uncategorized[0] as Record<string, unknown>).id;
    expect(characterDocumentV1Schema.safeParse(doc).success).toBe(false);
  });

  it('rejects a hit-dice key that is not a die size', () => {
    const doc = validDocument();
    doc.hitDices = { d8: { current: 1, total: 1 } } as never;
    expect(characterDocumentV1Schema.safeParse(doc).success).toBe(false);
  });

  it('accepts "c" and 1 through 9 as spell levels, and rejects 0 and 10', () => {
    for (const level of ['c', 1, 5, 9]) {
      const doc = validDocument();
      doc.spellList.categories[0]!.items[0]!.level = level as never;
      expect(characterDocumentV1Schema.safeParse(doc).success).toBe(true);
    }
    for (const level of [0, 10, '3']) {
      const doc = validDocument();
      doc.spellList.categories[0]!.items[0]!.level = level as never;
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

  it.each([
    ['inventory.items', (doc: Doc) => doc.inventory.items[0]!],
    ['equipment.weapons', (doc: Doc) => doc.equipment.weapons[0]!],
    ['equipment.other', (doc: Doc) => doc.equipment.other[0]!],
  ])('requires an id on every %s entry', (_location, pick) => {
    const doc = validDocument();
    delete (pick(doc) as Record<string, unknown>).id;
    expect(characterDocumentV1Schema.safeParse(doc).success).toBe(false);
  });

  // Every id-bearing accessor the document-level superRefine walks (document.ts's
  // idsWithPaths), so a missing or copy-pasted accessor there fails loudly instead of letting
  // duplicates in that one collection sail through. The victim id is always doc.classes[0]'s —
  // a fixed, different id from every target below — so each case is a genuine cross-collection
  // duplicate (the "classes" case duplicates within its own collection instead, matching the
  // one other case where the target IS classes[0]'s own collection).
  const duplicateIdCases: Array<[string, (doc: Doc) => void]> = [
    ['classes', (doc) => (doc.classes[1]!.id = doc.classes[0]!.id)],
    ['inventory.items', (doc) => (doc.inventory.items[0]!.id = doc.classes[0]!.id)],
    ['equipment.weapons', (doc) => (doc.equipment.weapons[0]!.id = doc.classes[0]!.id)],
    ['equipment.other', (doc) => (doc.equipment.other[0]!.id = doc.classes[0]!.id)],
    [
      'featsAndTraits category',
      (doc) => (doc.featsAndTraits.categories[0]!.id = doc.classes[0]!.id),
    ],
    [
      'featsAndTraits item in a category',
      (doc) => (doc.featsAndTraits.categories[0]!.items[0]!.id = doc.classes[0]!.id),
    ],
    [
      'featsAndTraits item in uncategorized',
      (doc) => (doc.featsAndTraits.uncategorized[0]!.id = doc.classes[0]!.id),
    ],
    ['spellList category', (doc) => (doc.spellList.categories[0]!.id = doc.classes[0]!.id)],
    [
      'spellList item in a category',
      (doc) => (doc.spellList.categories[0]!.items[0]!.id = doc.classes[0]!.id),
    ],
    [
      'spellList item in uncategorized',
      (doc) => (doc.spellList.uncategorized[0]!.id = doc.classes[0]!.id),
    ],
    ['counters category', (doc) => (doc.counters.categories[0]!.id = doc.classes[0]!.id)],
    [
      'counters item in a category',
      (doc) => (doc.counters.categories[0]!.items[0]!.id = doc.classes[0]!.id),
    ],
    [
      'counters item in uncategorized',
      (doc) => (doc.counters.uncategorized[0]!.id = doc.classes[0]!.id),
    ],
  ];

  describe('rejects a duplicate id at every id-bearing accessor', () => {
    it.each(duplicateIdCases)('%s', (_location, injectDuplicate) => {
      const doc = validDocument();
      injectDuplicate(doc);
      expect(characterDocumentV1Schema.safeParse(doc).success).toBe(false);
    });
  });

  it('reports the duplicate at the second occurrence, not the first', () => {
    const doc = validDocument();
    doc.classes[1]!.id = doc.classes[0]!.id;
    const result = characterDocumentV1Schema.safeParse(doc);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]!.path.join('.')).toBe('classes.1.id');
  });

  it('allows a character id that matches an item id, because doc.id is the store key', () => {
    const doc = validDocument();
    doc.classes[0]!.id = doc.id;
    expect(characterDocumentV1Schema.safeParse(doc).success).toBe(true);
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
      (doc.classes[0] as Record<string, unknown>).extra = 'x';
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
  // The `equipment` CONTAINER, not one of its items. This is the schema carrying spec §3.1's
  // "attuned and equipped are not stored at this level" — a business-layer bug writing a
  // derived `attuned` or `equipped` list onto `equipment` itself must be rejected, not stripped
  // on its way past. The equipment-item case below cannot detect that: it exercises
  // equipmentItem, a different schema instance.
  [
    'the equipment container',
    (doc) => {
      (doc.equipment as Record<string, unknown>).attuned = ['Cloak of Elvenkind'];
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
      (doc.spellList.categories[0]!.items[0]! as Record<string, unknown>).extra = 'x';
    },
  ],
  [
    'a counter entry',
    (doc) => {
      (doc.counters.categories[0]!.items[0]! as Record<string, unknown>).extra = 'x';
    },
  ],
  [
    'a categorized section object',
    (doc) => {
      (doc.featsAndTraits as Record<string, unknown>).extra = 'x';
    },
  ],
  // The {id, name, items} wrapper `categorized` builds for each category, not one of its
  // items — a new nested location since categories became an array (Task 3). The generic
  // contract (any unknown key rejected) is covered once, at the primitive, in
  // primitives.test.ts; this exercises the same wrapper as it actually appears in a document.
  [
    'a category entry',
    (doc) => {
      (doc.featsAndTraits.categories[0]! as Record<string, unknown>).extra = 'x';
    },
  ],
  [
    'a feats/traits item',
    (doc) => {
      (doc.featsAndTraits.categories[0]!.items[0]! as Record<string, unknown>).extra = 'x';
    },
  ],
  // The same item schema as the row above, but reached through `uncategorized` rather than
  // `categories[].items` — a distinct array in the document, so this proves that array is
  // actually wired through the item schema too, not merely present with the right static type.
  [
    'a feats/traits item in uncategorized',
    (doc) => {
      (doc.featsAndTraits.uncategorized[0]! as Record<string, unknown>).extra = 'x';
    },
  ],
  // The fixed-key MAP built by `fixedKeys`, not one of its entries — the same schema factory
  // backs `abilities`, `skills` and `counters.spellSlots`, and until this case none of the
  // three had one. The "requires all six abilities" test deletes a key, which exercises
  // requiredness; nothing exercised the map rejecting a key it does not know, so a
  // seventh ability (or a tenth spell-slot level) was silently dropped.
  [
    'the abilities fixed-key map',
    (doc) => {
      (doc.abilitiesAndSkills.abilities as Record<string, unknown>).luck = {
        score: 10,
        modifier: 0,
        savingThrowModifier: 0,
        savingThrowProficient: false,
      };
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
