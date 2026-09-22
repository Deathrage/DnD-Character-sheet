import type { CharacterDocument } from '../data/schema/index.js';

/**
 * The stored shapes, named for the layer they belong to. Never exported from
 * `src/business/index.ts`: the UI deals in business objects only, and a `*Data` type reaching
 * it would put the document's shape back into UI signatures.
 *
 * Derived from `CharacterDocument` rather than restated, so a schema change surfaces here as a
 * type error instead of a silent divergence.
 */
export type CharacterData = CharacterDocument;
export type ClassData = CharacterDocument['classes'][number];
export type HitPointsData = CharacterDocument['hitPoints'];
export type HitDieData = CharacterDocument['hitDices'][string];
export type JournalAndNotesData = CharacterDocument['journalAndNotes'];
export type CoinsData = CharacterDocument['inventory']['coins'];
export type InventoryItemData = CharacterDocument['inventory']['items'][number];
export type EquipmentItemData = CharacterDocument['equipment']['weapons'][number];
export type FeatData = CharacterDocument['featsAndTraits']['uncategorized'][number];
export type SpellData = CharacterDocument['spellList']['uncategorized'][number];
export type CounterData = CharacterDocument['counters']['uncategorized'][number];
export type SpellSlotData = CharacterDocument['counters']['spellSlots']['1'];
export type AbilityData = CharacterDocument['abilitiesAndSkills']['abilities']['strength'];
export type SkillData = CharacterDocument['abilitiesAndSkills']['skills']['stealth'];
