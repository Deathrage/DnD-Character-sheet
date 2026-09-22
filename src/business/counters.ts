import { CategorizedBO, CategorizedItemBO, type NewNamedItem } from './categorized.js';
import { createId } from './createId.js';
import { nonNegativeInt, trimmedName } from './guards.js';
import type { CounterData, CountersData, SpellSlotData } from './types.js';

// Duplicated rather than imported: `schema/index.ts` deliberately does not export
// SPELL_SLOT_LEVELS, because it is a fact about one schema version, and `src/business/` may not
// import a version directory. If v2 changed the set, this list would need changing too — which
// is the point, since the business layer would need deliberate updating either way.
const SPELL_SLOT_LEVELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

export class CounterBO extends CategorizedItemBO<CounterData> {
  get current(): number {
    return this.node.current;
  }

  setCurrent(value: number): void {
    this.node.current = nonNegativeInt(value);
  }

  get total(): number {
    return this.node.total;
  }

  setTotal(value: number): void {
    this.node.total = nonNegativeInt(value);
  }
}

/** One of nine fixed levels. The key is the identity, so there is no id and no add or remove. */
export class SpellSlotBO {
  readonly #node: SpellSlotData;
  readonly #level: number;

  constructor(node: SpellSlotData, level: number) {
    this.#node = node;
    this.#level = level;
  }

  get level(): number {
    return this.#level;
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
}

/**
 * The categorized shape plus the nine fixed spell slots, which sit alongside the categories in
 * the stored document rather than inside them.
 */
export class CountersBO extends CategorizedBO<CounterData, CounterBO> {
  readonly #node: CountersData;

  constructor(node: CountersData) {
    super(
      node,
      (item, siblings, owner) => new CounterBO(item, siblings, owner),
      ({ name, description = '' }: NewNamedItem): CounterData => ({
        id: createId(),
        name: trimmedName(name),
        description,
        current: 0,
        total: 0,
      }),
    );
    this.#node = node;
  }

  get spellSlots(): SpellSlotBO[] {
    return SPELL_SLOT_LEVELS.map((key) => new SpellSlotBO(this.#node.spellSlots[key], Number(key)));
  }
}
