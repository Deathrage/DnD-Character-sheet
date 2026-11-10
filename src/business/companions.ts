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
import { AbilityBO, type AbilityKey } from './abilitiesAndSkills.js';
import { newCounter } from './counters.js';
import { HitDicesBO, HitDieBO } from './hitDices.js';
import { HitPointsBO } from './hitPoints.js';
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
  readonly hitPoints: HitPointsBO;
  readonly abilities: Record<AbilityKey, AbilityBO>;
  readonly counters: CompanionCountersBO;

  constructor(node: CompanionData, siblings: CompanionData[]) {
    super(node, siblings);
    this.hitPoints = new HitPointsBO(node.hitPoints);
    this.abilities = Object.fromEntries(
      ABILITY_KEYS.map((key) => [key, new AbilityBO(node.abilities[key])]),
    ) as Record<AbilityKey, AbilityBO>;
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

  get hitDices(): CompanionHitDicesBO | null {
    if (this.node.hitDices === null) return null;
    return new CompanionHitDicesBO(this.node, this.siblings);
  }

  setHasHitDices(on: boolean): void {
    this.node.hitDices = on ? (this.node.hitDices ?? {}) : null;
  }
}

type HitDices = NonNullable<CompanionData['hitDices']>;

function hitDicesOf(companion: CompanionData): HitDices {
  if (companion.hitDices === null) {
    throw new RuleViolation('GONE', `${companion.name}'s hit dices are switched off`);
  }
  return companion.hitDices;
}

/** An add must not mint ids into a removed companion, as `CategoryBO.add` must not. */
function requireInDocument(companion: CompanionData, companions: CompanionData[]): void {
  if (!companions.includes(companion)) {
    throw new RuleViolation('GONE', 'this companion is no longer in the document');
  }
}

/**
 * Holds the companion, never its record: assigning `{}` to an observable stores a copy, so after
 * off and on the companion has a new record, and one held from before would be detached. So
 * `dice` reads the record the companion has now, and every die rule is `HitDicesBO`'s.
 *
 * `super` gets the record the companion has at construction. The base keeps it but reads it only
 * through `dice`, which this overrides, so it is never read again; it is the one real record to
 * give, and taking it throws `GONE` while the dice are off.
 */
export class CompanionHitDicesBO extends HitDicesBO {
  readonly #companion: CompanionData;
  readonly #companions: CompanionData[];

  constructor(companion: CompanionData, companions: CompanionData[]) {
    super(hitDicesOf(companion));
    this.#companion = companion;
    this.#companions = companions;
  }

  protected override get dice(): HitDices {
    return hitDicesOf(this.#companion);
  }

  protected override die(size: number): CompanionHitDieBO {
    return new CompanionHitDieBO(this.#companion, size);
  }

  /** Nothing while off, rather than `GONE` out of a render. */
  override get items(): HitDieBO[] {
    return this.#companion.hitDices === null ? [] : super.items;
  }

  /** A setter on a removed companion writes to its detached node, but an add must not. */
  override add(size: number): HitDieBO {
    requireInDocument(this.#companion, this.#companions);
    return super.add(size);
  }
}

/** As `CompanionHitDicesBO`: holds the companion and reads its record now. */
export class CompanionHitDieBO extends HitDieBO {
  readonly #companion: CompanionData;

  constructor(companion: CompanionData, size: number) {
    super(hitDicesOf(companion), size);
    this.#companion = companion;
  }

  protected override get dice(): HitDices {
    return hitDicesOf(this.#companion);
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
    requireInDocument(this.#companion, this.#companions);
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
