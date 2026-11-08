import { createId } from './createId.js';
import type { NewNamedItem } from './categorized.js';
import { RuleViolation } from './errors.js';
import {
  ABILITY_KEYS,
  integer,
  nonNegativeDecimal,
  nonNegativeInt,
  positiveDecimal,
  trimmedName,
} from './guards.js';
import { CreatureAbilityBO, type AbilityKey } from './abilitiesAndSkills.js';
import { newCounter } from './counters.js';
import { HitDicesBO } from './hitDices.js';
import { CreatureHitPointsBO } from './hitPoints.js';
import { NamedItemBO } from './namedItem.js';
import { pushAndRead } from './observableList.js';
import type { CompanionCounterData, CompanionData } from './types.js';

export class CompanionsBO {
  readonly #companions: CompanionData[];

  constructor(companions: CompanionData[]) {
    this.#companions = companions;
  }

  get items(): CompanionBO[] {
    return this.#companions.map((node) => new CompanionBO(node, this.#companions));
  }

  add(name: string): CompanionBO {
    const abilities = Object.fromEntries(
      ABILITY_KEYS.map((key) => [key, { score: 0, modifier: 0, savingThrowModifier: 0 }]),
    ) as CompanionData['abilities'];
    const stored = pushAndRead(this.#companions, {
      id: createId(),
      name: trimmedName(name),
      hitPoints: { current: 0, total: 0, temporary: 0 },
      hitDices: null,
      armorClass: 0,
      initiative: null,
      abilities,
      description: '',
      counters: [],
    });
    return new CompanionBO(stored, this.#companions);
  }
}

export class CompanionBO extends NamedItemBO<CompanionData> {
  readonly hitPoints: CreatureHitPointsBO;
  readonly abilities: Record<AbilityKey, CreatureAbilityBO>;
  readonly counters: CompanionCountersBO;

  constructor(node: CompanionData, siblings: CompanionData[]) {
    super(node, siblings);
    this.hitPoints = new CreatureHitPointsBO(node.hitPoints);
    this.abilities = Object.fromEntries(
      ABILITY_KEYS.map((key) => [key, new CreatureAbilityBO(node.abilities[key])]),
    ) as Record<AbilityKey, CreatureAbilityBO>;
    this.counters = new CompanionCountersBO(node, siblings);
  }

  get armorClass(): number {
    return this.node.armorClass;
  }

  setArmorClass(value: number): void {
    this.node.armorClass = nonNegativeInt(value);
  }

  get initiative(): number | null {
    return this.node.initiative;
  }

  /** On keeps a number already there, as `WeaponBO.setStackable` keeps a count. */
  setRollsInitiative(on: boolean): void {
    this.node.initiative = on ? (this.node.initiative ?? 0) : null;
  }

  setInitiative(value: number): void {
    const checked = integer(value);
    if (this.node.initiative === null) {
      throw new RuleViolation(
        'NO_INITIATIVE',
        `${this.name} does not roll initiative; switch it on first`,
      );
    }
    this.node.initiative = checked;
  }

  /** Built on every read: a record held across off and on would be a detached copy. */
  get hitDices(): HitDicesBO | null {
    if (this.node.hitDices === null) return null;
    return new HitDicesBO(() => (this.#live() ? this.node.hitDices : null));
  }

  setHasHitDices(on: boolean): void {
    this.node.hitDices = on ? (this.node.hitDices ?? {}) : null;
  }

  #live(): boolean {
    return this.siblings.includes(this.node);
  }
}

export class CompanionCountersBO {
  readonly #companion: CompanionData;
  readonly #companions: CompanionData[];

  constructor(companion: CompanionData, companions: CompanionData[]) {
    this.#companion = companion;
    this.#companions = companions;
  }

  get items(): CompanionCounterBO[] {
    const { counters } = this.#companion;
    return counters.map((node) => new CompanionCounterBO(node, counters));
  }

  add(init: NewNamedItem): CompanionCounterBO {
    if (!this.#companions.includes(this.#companion)) {
      throw new RuleViolation('GONE', 'this companion is no longer in the document');
    }
    const stored = pushAndRead(this.#companion.counters, newCounter(init));
    return new CompanionCounterBO(stored, this.#companion.counters);
  }
}

/**
 * Repeats `CounterBO`'s three guarded pairs: `CounterBO` extends `CategorizedItemBO`, which needs
 * a categorized owner a companion's flat list does not have.
 */
export class CompanionCounterBO extends NamedItemBO<CompanionCounterData> {
  get current(): number {
    return this.node.current;
  }

  setCurrent(value: number): void {
    this.node.current = nonNegativeDecimal(value);
  }

  get total(): number {
    return this.node.total;
  }

  setTotal(value: number): void {
    this.node.total = nonNegativeDecimal(value);
  }

  get step(): number {
    return this.node.step;
  }

  setStep(value: number): void {
    this.node.step = positiveDecimal(value);
  }
}
