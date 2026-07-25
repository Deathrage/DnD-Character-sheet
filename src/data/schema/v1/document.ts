// Schema v1 is frozen: this file defines what a v1 character document was allowed to be,
// and that meaning must not change under already-stored documents. A rule change here is a
// new schema version, not an edit — see ../README.md.

import { z } from 'zod';
import {
  categorized,
  currentAndTotal,
  dieSizeKey,
  isoDateTime,
  longText,
  nameAndDescription,
  nonNegativeInt,
  shortName,
  signedInt,
  uuid,
} from './primitives.js';

export const ABILITY_KEYS = [
  'strength',
  'dexterity',
  'constitution',
  'intelligence',
  'wisdom',
  'charisma',
] as const;

export const SKILL_KEYS = [
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

/** Spell-slot levels as they key the stored object: JSON stringifies numeric keys. */
export const SPELL_SLOT_LEVELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

/** 'c' for cantrip, then 1..9 (spec §3.1). The wireframe's 0 is not authoritative. */
const spellLevel = z.union([
  z.literal('c'),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(7),
  z.literal(8),
  z.literal(9),
]);

const classItem = z.object({ name: shortName, level: nonNegativeInt });

const inventoryItem = nameAndDescription.extend({ count: nonNegativeInt });

const equipmentItem = nameAndDescription.extend({
  attuned: z.boolean(),
  equipped: z.boolean(),
});

const spellListItem = nameAndDescription.extend({
  level: spellLevel,
  prepared: z.boolean(),
});

const countersItem = nameAndDescription.extend(currentAndTotal.shape);

/**
 * No `proficient`: ability-check proficiency has no referent in the rules (spec §3.1).
 * `.strict()` here (not just on the document root) is what makes a stray `proficient` on
 * an ability an error rather than a silently stripped key: Zod's `.strict()` does not
 * cascade into nested object schemas, so each schema that must reject unknown keys needs
 * its own call.
 */
const abilitiesItem = z
  .object({
    score: nonNegativeInt,
    modifier: signedInt,
    savingThrowModifier: signedInt,
    savingThrowProficient: z.boolean(),
  })
  .strict();

const skillsItem = z.object({
  modifier: signedInt,
  proficient: z.boolean(),
  expertise: z.boolean(),
});

const fixedKeys = <Key extends string, Value extends z.ZodTypeAny>(
  keys: readonly Key[],
  value: Value,
) => z.object(Object.fromEntries(keys.map((key) => [key, value])) as Record<Key, Value>);

const documentShape = z.object({
  schemaVersion: z.literal(1),
  id: uuid,
  name: shortName,
  updatedAt: isoDateTime,

  classes: z.record(shortName, classItem),

  hitPoints: currentAndTotal.extend({ temporary: nonNegativeInt }),
  hitDices: z.record(dieSizeKey, currentAndTotal),
  armorClass: nonNegativeInt,

  journalAndNotes: z.object({
    journal: z.array(longText),
    notes: longText,
  }),

  inventory: z.object({
    coins: z.object({
      pp: nonNegativeInt,
      gp: nonNegativeInt,
      ep: nonNegativeInt,
      sp: nonNegativeInt,
      cp: nonNegativeInt,
    }),
    items: z.array(inventoryItem),
  }),

  featsAndTraits: categorized(nameAndDescription),

  equipment: z.object({
    weapons: z.array(equipmentItem),
    other: z.array(equipmentItem),
  }),

  spellList: categorized(spellListItem),

  counters: categorized(countersItem).extend({
    spellSlots: fixedKeys(SPELL_SLOT_LEVELS, currentAndTotal),
  }),

  abilitiesAndSkills: z.object({
    proficiencyBonus: nonNegativeInt,
    passivePerception: nonNegativeInt,
    speed: nonNegativeInt,
    abilities: fixedKeys(ABILITY_KEYS, abilitiesItem),
    skills: fixedKeys(SKILL_KEYS, skillsItem),
  }),
});

export const characterDocumentV1Schema = documentShape.strict().superRefine((doc, ctx) => {
  for (const [key, value] of Object.entries(doc.classes)) {
    if (value.name !== key) {
      ctx.addIssue({
        code: 'custom',
        path: ['classes', key, 'name'],
        message: `class map key "${key}" must equal its name "${value.name}" (spec §3.3)`,
      });
    }
  }
});

export type CharacterDocumentV1 = z.infer<typeof characterDocumentV1Schema>;
