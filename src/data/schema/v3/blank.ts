// Schema v3, frozen from its first release: this file defines what a v3 character document is
// allowed to be, and that meaning must not change under already-stored documents. A rule change
// here is a new schema version, not an edit — see ../README.md#when-the-freeze-begins for what
// "frozen" means and when it starts applying.

import {
  ABILITY_KEYS,
  SKILL_KEYS,
  SPELL_SLOT_LEVELS,
  type CharacterDocumentV3 as CharacterDocument,
} from './document.js';

export interface CreateCharacterInput {
  name: string;
  /** Injected so callers control identity; the repository assigns a fresh one on import. */
  id: string;
  /** Injected so the result is assertable. */
  now: Date;
}

const zero = () => ({ current: 0, total: 0 });

// `Item` has no parameter to infer from — it is resolved from the contextual type at each call
// site below, i.e. from `createCharacter`'s declared `CharacterDocument` return type. Building
// this object into a local variable before returning would drop that context and force an
// explicit type argument (or `any`) at each call site instead.
const emptyCategorized = <Item>() => ({
  categories: [] as { id: string; name: string; items: Item[] }[],
  uncategorized: [] as Item[],
});

export function createCharacter({ name, id, now }: CreateCharacterInput): CharacterDocument {
  return {
    schemaVersion: 3,
    id,
    name: name.trim(),
    updatedAt: now.toISOString(),

    classes: [],

    hitPoints: { current: 0, total: 0, temporary: 0 },
    hitDices: {},
    armorClass: 0,
    initiative: 0,

    journalAndNotes: { journal: [], notes: '' },

    inventory: {
      coins: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
      items: [],
    },

    featsAndTraits: emptyCategorized(),

    equipment: { weapons: [], other: [] },

    spellList: { ...emptyCategorized(), spellcasting: {} },

    counters: {
      ...emptyCategorized(),
      spellSlots: Object.fromEntries(
        SPELL_SLOT_LEVELS.map((level) => [level, zero()]),
      ) as CharacterDocument['counters']['spellSlots'],
    },

    abilitiesAndSkills: {
      proficiencyBonus: 0,
      passivePerception: 0,
      speed: 0,
      abilities: Object.fromEntries(
        ABILITY_KEYS.map((key) => [
          key,
          { score: 0, modifier: 0, savingThrowModifier: 0, savingThrowProficient: false },
        ]),
      ) as CharacterDocument['abilitiesAndSkills']['abilities'],
      skills: Object.fromEntries(
        SKILL_KEYS.map((key) => [key, { modifier: 0, proficient: false, expertise: false }]),
      ) as CharacterDocument['abilitiesAndSkills']['skills'],
    },
  };
}
