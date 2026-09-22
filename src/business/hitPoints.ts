import { nonNegativeInt } from './guards.js';
import type { HitPointsData } from './types.js';

export class HitPointsBO {
  readonly #node: HitPointsData;

  constructor(node: HitPointsData) {
    this.#node = node;
  }

  get current(): number {
    return this.#node.current;
  }

  /** Not checked against `total`: a player may knowingly set it higher (spec section 3.2). */
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
