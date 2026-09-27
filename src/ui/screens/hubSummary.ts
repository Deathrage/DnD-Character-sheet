import { formatSigned } from '../format.js';
import { COINS, ordinalSuffix } from '../reference.js';
import type { CategorizedView, SectionKey } from '../types.js';
import type { SheetData } from './CharacterHub.js';

const EMPTY = 'Nothing yet';

/**
 * The line under each entry on the hub's contents: what that section holds, so the hub answers
 * "what's in there" before a tap. Every line only counts or repeats what the player typed —
 * nothing is converted, totalled or looked up, the same as the category badges ("3/3 prepared").
 */
export function summariseSections(data: SheetData): Record<SectionKey, string> {
  const { journalAndNotes, inventory, featsAndTraits, equipment, spellList, counters } = data;
  const { proficiencyBonus, passivePerception, speed } = data.abilitiesAndSkills;

  const coins = COINS.filter(({ key }) => inventory.coins[key] > 0).map(
    ({ key }) => `${inventory.coins[key]} ${key}`,
  );
  const gear = equipment.weapons.length + equipment.other.length;
  const spells = all(spellList);
  const slots = counters.spellSlots
    .filter((slot) => slot.total > 0)
    .map((slot) => `${slot.level}${ordinalSuffix(slot.level)} ${slot.current}/${slot.total}`);
  const otherCounters = all(counters).length;

  return {
    journal: line([journalAndNotes.days.length > 0 && plural(journalAndNotes.days.length, 'day')]),
    inventory: line([
      inventory.items.length > 0 && plural(inventory.items.length, 'item'),
      ...coins,
    ]),
    feats: line([
      all(featsAndTraits).length > 0 && plural(all(featsAndTraits).length, 'entry', 'entries'),
    ]),
    equipment: line([
      gear > 0 && plural(gear, 'item'),
      equipment.equipped.length > 0 && `${equipment.equipped.length} equipped`,
      equipment.attuned.length > 0 && `${equipment.attuned.length} attuned`,
    ]),
    spells: line([
      spells.length > 0 &&
        `${spells.filter((spell) => spell.prepared).length} of ${spells.length} prepared`,
    ]),
    counters: line([
      ...slots,
      otherCounters > 0 &&
        (slots.length > 0 ? `${otherCounters} more` : plural(otherCounters, 'counter')),
    ]),
    abilities: `Prof ${formatSigned(proficiencyBonus)} · Pas. per. ${passivePerception} · Speed ${speed}`,
  };
}

function all<T>({ categories, uncategorized }: CategorizedView<T>): T[] {
  return [...uncategorized, ...categories.flatMap((category) => category.items)];
}

function line(parts: (string | false)[]): string {
  const present = parts.filter((part): part is string => part !== false);
  return present.length > 0 ? present.join(' · ') : EMPTY;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
