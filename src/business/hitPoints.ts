import { RuleViolation } from './errors.js';
import { nonNegativeInt } from './guards.js';
import type { DeathSavesData, HitPointsData } from './types.js';

// Duplicated rather than imported, like `SPELL_SLOT_LEVELS` in `counters.ts`: it is a fact about
// one schema version (v4's `deathSaveCount`), and `src/business/` may not import a version
// directory. A fourth tick would make the document unsaveable, so it is refused here instead.
const DEATH_SAVE_BOXES = 3;

export class HitPointsBO {
  readonly #node: HitPointsData;
  readonly deathSaves: DeathSavesBO;

  constructor(node: HitPointsData) {
    this.#node = node;
    this.deathSaves = new DeathSavesBO(node.deathSaves);
  }

  get current(): number {
    return this.#node.current;
  }

  /**
   * Not checked against `total`: a player may knowingly set it higher (spec section 3.2). Nor does
   * it touch the death saves, at 0 or above: they are the player's to tick and to clear.
   */
  setCurrent(value: number): void {
    this.#node.current = nonNegativeInt(value);
  }

  get total(): number {
    return this.#node.total;
  }

  setTotal(value: number): void {
    this.#node.total = nonNegativeInt(value);
  }

  get temporary(): number {
    return this.#node.temporary;
  }

  setTemporary(value: number): void {
    this.#node.temporary = nonNegativeInt(value);
  }
}

/**
 * The ticked boxes, counted: three successes and three failures. Nothing here reacts to anything —
 * no tick at 0 hit points, no "dead" at three failures, no clearing when hit points rise. The
 * player ticks, and the player clears.
 */
export class DeathSavesBO {
  readonly #node: DeathSavesData;

  constructor(node: DeathSavesData) {
    this.#node = node;
  }

  get successes(): number {
    return this.#node.successes;
  }

  setSuccesses(value: number): void {
    this.#node.successes = boxCount(value);
  }

  get failures(): number {
    return this.#node.failures;
  }

  setFailures(value: number): void {
    this.#node.failures = boxCount(value);
  }

  clear(): void {
    this.#node.successes = 0;
    this.#node.failures = 0;
  }
}

function boxCount(value: number): number {
  if (nonNegativeInt(value) > DEATH_SAVE_BOXES) {
    throw new RuleViolation(
      'ABOVE_THREE',
      `expected at most ${DEATH_SAVE_BOXES} ticked boxes, got ${value}`,
    );
  }
  return value;
}
