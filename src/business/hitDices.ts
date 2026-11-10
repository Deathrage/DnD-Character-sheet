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
   * Every read and write goes through this, never through `#dice`: a companion's record is
   * replaced when its dice switch off and on, so `CompanionHitDicesBO` overrides it to read the
   * record the companion has now. `protected` for the reason `NodeBO.node` is: a subclass must
   * reach it, and reaching it from outside takes a deliberate cast.
   */
  protected get dice(): HitDices {
    return this.#dice;
  }

  /** `CompanionHitDicesBO` overrides it, so `items` and `add` hand out its own die. */
  protected die(size: number): HitDieBO {
    return new HitDieBO(this.dice, size);
  }

  /**
   * Ascending by size. The stored keys are numeric-like strings, which iterate in ascending
   * numeric order, but sorting explicitly says so rather than relying on that.
   */
  get items(): HitDieBO[] {
    return Object.keys(this.dice)
      .map(Number)
      .sort((a, b) => a - b)
      .map((size) => this.die(size));
  }

  /**
   * A die's identity is its record key, and the key is `String(size)`, so the one honest test is
   * whether that string is a key the schema's `dieSizeKey` accepts: digits, no leading zero. That
   * single check covers every way a size goes wrong — 0 and -4 (no digits-only string), 2.5 (a
   * dot), and 1e21, which stringifies as `"1e+21"` and would land a key in the document that no
   * schema version accepts. `NOT_AN_INTEGER` was the previous answer and it lied: 0 and 1e21 are
   * both integers, and `NEGATIVE` would lie about the same two. Hence a die-specific code,
   * alongside the `DUPLICATE_DIE` just below it.
   *
   * `dice` is read first, so a companion's dice held while off answer `GONE` whatever the size.
   */
  add(size: number): HitDieBO {
    const dice = this.dice;
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
    return this.die(size);
  }
}

export class HitDieBO {
  readonly #dice: HitDices;
  readonly #key: string;

  constructor(dice: HitDices, size: number) {
    this.#dice = dice;
    this.#key = String(size);
  }

  /** As `HitDicesBO.dice`; `CompanionHitDieBO` overrides it. */
  protected get dice(): HitDices {
    return this.#dice;
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
    delete this.dice[this.#key];
  }

  /**
   * Keyed by die size rather than held by reference, because `hitDices` is a record and a die's
   * identity IS its key. `NodeBO` does not fit: there is no sibling array to splice.
   */
  get #node(): HitDieData {
    return this.#require();
  }

  #require(): HitDieData {
    const node = this.dice[this.#key];
    if (node === undefined) {
      throw new RuleViolation('GONE', `the d${this.#key} is no longer in the document`);
    }
    return node;
  }
}
