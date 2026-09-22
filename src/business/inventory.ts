import { createId } from './createId.js';
import { longText, nonNegativeInt, trimmedName } from './guards.js';
import { NamedItemBO } from './namedItem.js';
import { pushAndRead } from './observableList.js';
import type { CoinsData, InventoryItemData } from './types.js';

export interface NewInventoryItem {
  name: string;
  description?: string;
  count?: number;
}

export class InventoryBO {
  readonly coins: CoinsBO;
  readonly #items: InventoryItemData[];

  constructor(coins: CoinsData, items: InventoryItemData[]) {
    this.coins = new CoinsBO(coins);
    this.#items = items;
  }

  get items(): InventoryItemBO[] {
    return this.#items.map((node) => new InventoryItemBO(node, this.#items));
  }

  add({ name, description = '', count = 0 }: NewInventoryItem): InventoryItemBO {
    const node = pushAndRead(this.#items, {
      id: createId(),
      name: trimmedName(name),
      description: longText(description),
      count: nonNegativeInt(count),
    });
    return new InventoryItemBO(node, this.#items);
  }
}

/** Five fixed denominations; the keys are the identity, so there are no ids and no add/remove. */
export class CoinsBO {
  readonly #node: CoinsData;

  constructor(node: CoinsData) {
    this.#node = node;
  }

  get pp(): number {
    return this.#node.pp;
  }

  setPp(value: number): void {
    this.#node.pp = nonNegativeInt(value);
  }

  get gp(): number {
    return this.#node.gp;
  }

  setGp(value: number): void {
    this.#node.gp = nonNegativeInt(value);
  }

  get ep(): number {
    return this.#node.ep;
  }

  setEp(value: number): void {
    this.#node.ep = nonNegativeInt(value);
  }

  get sp(): number {
    return this.#node.sp;
  }

  setSp(value: number): void {
    this.#node.sp = nonNegativeInt(value);
  }

  get cp(): number {
    return this.#node.cp;
  }

  setCp(value: number): void {
    this.#node.cp = nonNegativeInt(value);
  }
}

export class InventoryItemBO extends NamedItemBO<InventoryItemData> {
  get count(): number {
    return this.node.count;
  }

  setCount(value: number): void {
    this.node.count = nonNegativeInt(value);
  }
}
