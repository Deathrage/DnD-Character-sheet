import { CategorizedBO, CategorizedItemBO, type NewNamedItem } from './categorized.js';
import { createId } from './createId.js';
import { longText, trimmedName } from './guards.js';
import { SpellcastingBO } from './spellcasting.js';
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

/**
 * The categorized shape plus spellcasting, which sits beside the categories in the stored document
 * the way spell slots sit beside the counters' categories.
 */
export class SpellListBO extends CategorizedBO<SpellData, SpellBO> {
  readonly spellcasting: SpellcastingBO;

  constructor(node: SpellListData) {
    super(
      node,
      (item, siblings, owner) => new SpellBO(item, siblings, owner),
      ({ name, description = '' }: NewNamedItem): SpellData => ({
        id: createId(),
        name: trimmedName(name),
        description: longText(description),
        level: 'c',
        prepared: false,
      }),
    );
    this.spellcasting = new SpellcastingBO(node.spellcasting);
  }
}
