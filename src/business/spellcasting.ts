import type { AbilityKey } from './abilitiesAndSkills.js';
import { RuleViolation } from './errors.js';
import { ABILITY_KEYS, abilityKey, integer, nonNegativeInt } from './guards.js';
import type { SpellcastingData, SpellcastingEntryData } from './types.js';

/**
 * One entry per spellcasting ability, keyed by it (spec §4.2). Like `HitDicesBO`: the record key
 * is the identity, so there is no id, and no business object holds an entry by reference.
 */
export class SpellcastingBO {
  readonly #record: SpellcastingData;

  constructor(record: SpellcastingData) {
    this.#record = record;
  }

  /** STR to CHA, the order every sheet prints abilities in — not the order they were added. */
  get items(): SpellcastingEntryBO[] {
    return ABILITY_KEYS.filter((key) => this.#record[key] !== undefined).map(
      (key) => new SpellcastingEntryBO(this.#record, key),
    );
  }

  /**
   * Takes the numbers with the ability, so an entry never exists before the player has seen its
   * fields. Everything is checked before the record is touched.
   */
  add(ability: AbilityKey, init: { attackBonus: number; saveDc: number }): SpellcastingEntryBO {
    const key = abilityKey(ability);
    const entry = { attackBonus: integer(init.attackBonus), saveDc: nonNegativeInt(init.saveDc) };
    if (this.#record[key] !== undefined) {
      throw new RuleViolation('DUPLICATE_SPELLCASTING', `${key} already has a spellcasting entry`);
    }
    this.#record[key] = entry;
    return new SpellcastingEntryBO(this.#record, key);
  }
}

/**
 * One ability's spell attack bonus and save DC. Re-reads its entry by key on every access, so a
 * removed entry reports `GONE` rather than writing to an object the document no longer holds.
 */
export class SpellcastingEntryBO {
  readonly #record: SpellcastingData;
  readonly #key: AbilityKey;

  constructor(record: SpellcastingData, key: AbilityKey) {
    this.#record = record;
    this.#key = key;
  }

  get ability(): AbilityKey {
    return this.#key;
  }

  get attackBonus(): number {
    return this.#require().attackBonus;
  }

  /** Signed, and entered by the player — never worked out from a modifier. */
  setAttackBonus(value: number): void {
    const attackBonus = integer(value);
    this.#require().attackBonus = attackBonus;
  }

  get saveDc(): number {
    return this.#require().saveDc;
  }

  /** Entered by the player — never worked out from the attack bonus. */
  setSaveDc(value: number): void {
    const saveDc = nonNegativeInt(value);
    this.#require().saveDc = saveDc;
  }

  remove(): void {
    this.#require();
    delete this.#record[this.#key];
  }

  #require(): SpellcastingEntryData {
    const entry = this.#record[this.#key];
    if (entry === undefined) {
      throw new RuleViolation(
        'GONE',
        `the ${this.#key} spellcasting entry is no longer in the document`,
      );
    }
    return entry;
  }
}
