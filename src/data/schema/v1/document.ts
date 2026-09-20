// Schema v1 is frozen: this file defines what a v1 character document was allowed to be,
// and that meaning must not change under already-stored documents. A rule change here is a
// new schema version, not an edit — see ../README.md#when-the-freeze-begins for what "frozen"
// means and when it starts applying.

// Every object schema below ends in `.strict()`: an unknown key is always an error, never a
// silent drop. This is a correctness property, not a tidiness one. The raw-JSON editor is a
// headline feature — a user can hand-edit a character and save it — and a document is never
// silently repaired. If validation stripped a typo'd key (e.g. `temporry` instead of
// `temporary`) instead of rejecting it, the edit would vanish with no error reported and the
// stale value would remain; a later migration function would also never get a chance to see
// or rescue a field it might care about, because by the time it runs the unknown key is
// already gone.
//
// `.strict()` does not cascade: it closes a schema's own key set, not that of any other schema
// merely used as one of its property values. Wrapping the document root in `.strict()` did not
// stop an unknown key on `abilitiesItem` from being silently stripped, because `abilitiesItem`
// is a separate schema instance referenced as a nested value — confirmed against Zod 4.4.3, not
// assumed. That is why every schema below is `.strict()` itself, including ones only ever used
// as a nested value. (`.extend()`, separately, does preserve a strict base's closed key set in
// this Zod version — also confirmed, not assumed — so a trailing `.strict()` after `.extend()`
// is not strictly load-bearing below, but each schema still ends in one explicitly, so its
// strictness is visible at its own definition rather than depending on a reader tracing back
// through an `.extend()` chain to confirm the base was strict.)

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

const classItem = z.object({ id: uuid, name: shortName, level: nonNegativeInt }).strict();

const inventoryItem = nameAndDescription.extend({ count: nonNegativeInt }).strict();

const equipmentItem = nameAndDescription
  .extend({
    attuned: z.boolean(),
    equipped: z.boolean(),
  })
  .strict();

const spellListItem = nameAndDescription
  .extend({
    level: spellLevel,
    prepared: z.boolean(),
  })
  .strict();

const countersItem = nameAndDescription.extend(currentAndTotal.shape).strict();

/** No `proficient`: ability-check proficiency has no referent in the rules (spec §3.1). */
const abilitiesItem = z
  .object({
    score: nonNegativeInt,
    modifier: signedInt,
    savingThrowModifier: signedInt,
    savingThrowProficient: z.boolean(),
  })
  .strict();

const skillsItem = z
  .object({
    modifier: signedInt,
    proficient: z.boolean(),
    expertise: z.boolean(),
  })
  .strict();

const fixedKeys = <Key extends string, Value extends z.ZodType>(
  keys: readonly Key[],
  value: Value,
) => z.object(Object.fromEntries(keys.map((key) => [key, value])) as Record<Key, Value>).strict();

const documentShape = z.object({
  schemaVersion: z.literal(1),
  id: uuid,
  name: shortName,
  updatedAt: isoDateTime,

  classes: z.array(classItem),

  hitPoints: currentAndTotal.extend({ temporary: nonNegativeInt }).strict(),
  hitDices: z.record(dieSizeKey, currentAndTotal),
  armorClass: nonNegativeInt,

  journalAndNotes: z
    .object({
      journal: z.array(longText),
      notes: longText,
    })
    .strict(),

  inventory: z
    .object({
      coins: z
        .object({
          pp: nonNegativeInt,
          gp: nonNegativeInt,
          ep: nonNegativeInt,
          sp: nonNegativeInt,
          cp: nonNegativeInt,
        })
        .strict(),
      items: z.array(inventoryItem),
    })
    .strict(),

  featsAndTraits: categorized(nameAndDescription),

  equipment: z
    .object({
      weapons: z.array(equipmentItem),
      other: z.array(equipmentItem),
    })
    .strict(),

  spellList: categorized(spellListItem),

  counters: categorized(countersItem)
    .extend({
      spellSlots: fixedKeys(SPELL_SLOT_LEVELS, currentAndTotal),
    })
    .strict(),

  abilitiesAndSkills: z
    .object({
      proficiencyBonus: nonNegativeInt,
      passivePerception: nonNegativeInt,
      speed: nonNegativeInt,
      abilities: fixedKeys(ABILITY_KEYS, abilitiesItem),
      skills: fixedKeys(SKILL_KEYS, skillsItem),
    })
    .strict(),
});

export const characterDocumentV1Schema = documentShape.strict();

export type CharacterDocumentV1 = z.infer<typeof characterDocumentV1Schema>;
