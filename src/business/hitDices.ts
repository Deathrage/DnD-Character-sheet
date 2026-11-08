import { RuleViolation } from './errors.js';
import { nonNegativeInt } from './guards.js';
import type { CharacterData, HitDieData } from './types.js';

type HitDices = CharacterData['hitDices'];

/**
 * Re-read on every access, never held: assigning an object to an observable stores a copy, so a
 * record captured before it was switched off and on again would be a detached object.
 */
type Resolve = () => HitDices | null;

function record(resolve: Resolve): HitDices {
  const dice = resolve();
  if (dice === null) {
    throw new RuleViolation('GONE', 'these hit dice are switched off or no longer in the document');
  }
  return dice;
}

export class HitDicesBO {
  readonly #resolve: Resolve;

  constructor(resolve: Resolve) {
    this.#resolve = resolve;
  }

  /**
   * Ascending by size. The stored keys are numeric-like strings, which iterate in ascending
   * numeric order, but sorting explicitly says so rather than relying on that.
   */
  get items(): HitDieBO[] {
    const dice = this.#resolve();
    if (dice === null) return [];
    return Object.keys(dice)
      .map(Number)
      .sort((a, b) => a - b)
      .map((size) => new HitDieBO(this.#resolve, size));
  }

  /**
   * A die's identity is its record key, and the key is `String(size)`, so the one honest test is
   * whether that string is a key the schema's `dieSizeKey` accepts: digits, no leading zero. That
   * single check covers every way a size goes wrong — 0 and -4 (no digits-only string), 2.5 (a
   * dot), and 1e21, which stringifies as `"1e+21"` and would land a key in the document that no
   * schema version accepts. `NOT_AN_INTEGER` was the previous answer and it lied: 0 and 1e21 are
   * both integers, and `NEGATIVE` would lie about the same two. Hence a die-specific code,
   * alongside the `DUPLICATE_DIE` just below it.
   */
  add(size: number): HitDieBO {
    const dice = record(this.#resolve);
    const key = String(size);
    if (!/^[1-9]\d*$/.test(key)) {
      throw new RuleViolation(
        'INVALID_DIE_SIZE',
        `a die size must be a whole number of at least 1 that stores as plain digits, got ${key}`,
      );
    }
    if (key in dice) {
      throw new RuleViolation('DUPLICATE_DIE', `a d${key} is already present`);
    }

    dice[key] = { current: 0, total: 0 };
    return new HitDieBO(this.#resolve, size);
  }
}

export class HitDieBO {
  readonly #resolve: Resolve;
  readonly #key: string;

  constructor(resolve: Resolve, size: number) {
    this.#resolve = resolve;
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
    delete record(this.#resolve)[this.#key];
  }

  /**
   * Keyed by die size rather than held by reference, because `hitDices` is a record and a die's
   * identity IS its key. `NodeBO` does not fit: there is no sibling array to splice.
   */
  get #node(): HitDieData {
    return this.#require();
  }

  #require(): HitDieData {
    const node = record(this.#resolve)[this.#key];
    if (node === undefined) {
      throw new RuleViolation('GONE', `the d${this.#key} is no longer in the document`);
    }
    return node;
  }
}
