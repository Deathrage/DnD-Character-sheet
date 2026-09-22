import { createId } from './createId.js';
import { trimmedName } from './guards.js';
import { NamedItemBO } from './namedItem.js';
import { pushAndRead } from './observableList.js';
import type { EquipmentItemData } from './types.js';

export interface NewEquipmentItem {
  name: string;
  description?: string;
  attuned?: boolean;
  equipped?: boolean;
}

export class EquipmentBO {
  readonly #weapons: EquipmentItemData[];
  readonly #other: EquipmentItemData[];

  constructor(weapons: EquipmentItemData[], other: EquipmentItemData[]) {
    this.#weapons = weapons;
    this.#other = other;
  }

  get weapons(): EquipmentItemBO[] {
    return this.#weapons.map((node) => new EquipmentItemBO(node, this.#weapons));
  }

  get other(): EquipmentItemBO[] {
    return this.#other.map((node) => new EquipmentItemBO(node, this.#other));
  }

  addWeapon(init: NewEquipmentItem): EquipmentItemBO {
    return addTo(this.#weapons, init);
  }

  addOther(init: NewEquipmentItem): EquipmentItemBO {
    return addTo(this.#other, init);
  }

  /**
   * Derived views over both lists, never stored (spec section 2.6). `attuned` and `equipped` are
   * treated identically throughout: a boolean on the item, a derived list, and a toggle each.
   * Neither carries a rule — the app does not cap attunement or check what can be worn.
   */
  get attuned(): EquipmentItemBO[] {
    return [...this.weapons, ...this.other].filter((item) => item.attuned);
  }

  get equipped(): EquipmentItemBO[] {
    return [...this.weapons, ...this.other].filter((item) => item.equipped);
  }
}

function addTo(
  list: EquipmentItemData[],
  { name, description = '', attuned = false, equipped = false }: NewEquipmentItem,
): EquipmentItemBO {
  const node = pushAndRead(list, {
    id: createId(),
    name: trimmedName(name),
    description,
    attuned,
    equipped,
  });
  return new EquipmentItemBO(node, list);
}

export class EquipmentItemBO extends NamedItemBO<EquipmentItemData> {
  get attuned(): boolean {
    return this.node.attuned;
  }

  setAttuned(value: boolean): void {
    this.node.attuned = value;
  }

  get equipped(): boolean {
    return this.node.equipped;
  }

  setEquipped(value: boolean): void {
    this.node.equipped = value;
  }
}
