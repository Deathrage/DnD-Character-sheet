import { RuleViolation } from './errors.js';
import { nonNegativeInt } from './guards.js';
import type { CharacterData, HitDieData } from './types.js';

type HitDices = CharacterData['hitDices'];

export class HitDicesBO {
  readonly #dice: HitDices;

  constructor(dice: HitDices) {
    this.#dice = dice;
  }

  /**
   * Ascending by size. The stored keys are numeric-like strings, which iterate in ascending
   * numeric order, but sorting explicitly says so rather than relying on that.
   */
  get items(): HitDieBO[] {
    return Object.keys(this.#dice)
      .map(Number)
      .sort((a, b) => a - b)
      .map((size) => new HitDieBO(this.#dice, size));
  }

  add(size: number): HitDieBO {
    if (nonNegativeInt(size) === 0) {
      throw new RuleViolation('NOT_AN_INTEGER', 'a die size must be at least 1');
    }

    const key = String(size);
    if (key in this.#dice) {
      throw new RuleViolation('DUPLICATE_DIE', `a d${key} is already present`);
    }

    this.#dice[key] = { current: 0, total: 0 };
    return new HitDieBO(this.#dice, size);
  }
}

export class HitDieBO {
  readonly #dice: HitDices;
  readonly #key: string;

  constructor(dice: HitDices, size: number) {
    this.#dice = dice;
    this.#key = String(size);
  }

  get size(): number {
    return Number(this.#key);
  }

  get current(): number {
    return this.#node.current;
  }

  setCurrent(value: number): void {
    this.#node.current = nonNegativeInt(value);
  }

  get total(): number {
    return this.#node.total;
  }

  setTotal(value: number): void {
    this.#node.total = nonNegativeInt(value);
  }

  remove(): void {
    this.#require();
    delete this.#dice[this.#key];
  }

  /**
   * Keyed by die size rather than held by reference, because `hitDices` is a record and a die's
   * identity IS its key. `NodeBO` does not fit: there is no sibling array to splice.
   */
  get #node(): HitDieData {
    return this.#require();
  }

  #require(): HitDieData {
    const node = this.#dice[this.#key];
    if (node === undefined) {
      throw new RuleViolation('GONE', `the d${this.#key} is no longer in the document`);
    }
    return node;
  }
}
