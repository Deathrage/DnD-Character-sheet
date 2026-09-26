/**
 * Reference data: facts about D&D that are not facts about *this character*, so they are never
 * stored in the document.
 *
 * The ability keyed to each skill is the clearest case — spec §3.2 says outright that it "is not
 * stored. It is reference data and lives as a UI constant." Display order is the same kind of
 * thing: the document is a record with fixed keys and no order of its own, and STR/DEX/CON/INT/
 * WIS/CHA is how every sheet ever printed lays them out.
 *
 * Nothing here computes anything. A skill's ability is a label on the row, not an input to a
 * modifier the app works out for you.
 */

export const ABILITIES = [
  { key: 'strength', short: 'STR', name: 'Strength' },
  { key: 'dexterity', short: 'DEX', name: 'Dexterity' },
  { key: 'constitution', short: 'CON', name: 'Constitution' },
  { key: 'intelligence', short: 'INT', name: 'Intelligence' },
  { key: 'wisdom', short: 'WIS', name: 'Wisdom' },
  { key: 'charisma', short: 'CHA', name: 'Charisma' },
] as const;

export type AbilityKey = (typeof ABILITIES)[number]['key'];

type Ability = (typeof ABILITIES)[number];

const BY_KEY = Object.fromEntries(ABILITIES.map((ability) => [ability.key, ability])) as Record<
  AbilityKey,
  Ability
>;

/** The labels for one ability: `abilityOf('intelligence').short` is `INT`. */
export function abilityOf(key: AbilityKey): Ability {
  return BY_KEY[key];
}

export const SKILLS = [
  { key: 'acrobatics', label: 'Acrobatics', ability: 'DEX' },
  { key: 'animalHandling', label: 'Animal Handling', ability: 'WIS' },
  { key: 'arcana', label: 'Arcana', ability: 'INT' },
  { key: 'athletics', label: 'Athletics', ability: 'STR' },
  { key: 'deception', label: 'Deception', ability: 'CHA' },
  { key: 'history', label: 'History', ability: 'INT' },
  { key: 'insight', label: 'Insight', ability: 'WIS' },
  { key: 'intimidation', label: 'Intimidation', ability: 'CHA' },
  { key: 'investigation', label: 'Investigation', ability: 'INT' },
  { key: 'medicine', label: 'Medicine', ability: 'WIS' },
  { key: 'nature', label: 'Nature', ability: 'INT' },
  { key: 'perception', label: 'Perception', ability: 'WIS' },
  { key: 'performance', label: 'Performance', ability: 'CHA' },
  { key: 'persuasion', label: 'Persuasion', ability: 'CHA' },
  { key: 'religion', label: 'Religion', ability: 'INT' },
  { key: 'sleightOfHand', label: 'Sleight of Hand', ability: 'DEX' },
  { key: 'stealth', label: 'Stealth', ability: 'DEX' },
  { key: 'survival', label: 'Survival', ability: 'WIS' },
] as const;

export type SkillKey = (typeof SKILLS)[number]['key'];

export const COINS = [
  { key: 'pp', label: 'PP' },
  { key: 'gp', label: 'GP' },
  { key: 'ep', label: 'EP' },
  { key: 'sp', label: 'SP' },
  { key: 'cp', label: 'CP' },
] as const;

export type CoinKey = (typeof COINS)[number]['key'];

/** `'c'` for cantrip then 1–9, per the schema. The wireframe's `0` is not authoritative. */
export const SPELL_LEVELS = ['c', 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

export type SpellLevel = (typeof SPELL_LEVELS)[number];

/** `Cantrip`, `1st Level`, `2nd Level`, … for a select; `C`, `1`, `2`, … for the row badge. */
export function spellLevelName(level: SpellLevel): string {
  return level === 'c' ? 'Cantrip' : `${level}${ordinalSuffix(level)} Level`;
}

export function spellLevelBadge(level: SpellLevel): string {
  return level === 'c' ? 'C' : String(level);
}

export function ordinalSuffix(n: number): string {
  if (n % 100 > 10 && n % 100 < 14) return 'th';
  return ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
}
