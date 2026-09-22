import { CategorizedBO, CategorizedItemBO, type NewNamedItem } from './categorized.js';
import { createId } from './createId.js';
import { trimmedName } from './guards.js';
import type { SpellData, SpellListData } from './types.js';

/** 'c' for cantrip, then 1 to 9. The wireframe's 0 is not authoritative (spec section 3.1). */
export type SpellLevel = SpellData['level'];

export class SpellBO extends CategorizedItemBO<SpellData> {
  get level(): SpellLevel {
    return this.node.level;
  }

  setLevel(value: SpellLevel): void {
    this.node.level = value;
  }

  get prepared(): boolean {
    return this.node.prepared;
  }

  setPrepared(value: boolean): void {
    this.node.prepared = value;
  }
}

export type SpellListBO = CategorizedBO<SpellData, SpellBO>;

export const makeSpellList = (node: SpellListData): SpellListBO =>
  new CategorizedBO<SpellData, SpellBO>(
    node,
    (item, siblings, owner) => new SpellBO(item, siblings, owner),
    ({ name, description = '' }: NewNamedItem): SpellData => ({
      id: createId(),
      name: trimmedName(name),
      description,
      level: 'c',
      prepared: false,
    }),
  );
