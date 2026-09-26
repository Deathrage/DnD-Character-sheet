import { createId } from './createId.js';
import { longText, trimmedName } from './guards.js';
import { NamedItemBO } from './namedItem.js';
import { pushAndRead } from './observableList.js';
import type { EquipmentItemData, WeaponData } from './types.js';

export interface NewEquipmentItem {
  name: string;
  description?: string;
  attuned?: boolean;
  equipped?: boolean;
}

export class EquipmentBO {
  readonly #weapons: WeaponData[];
  readonly #other: EquipmentItemData[];

  constructor(weapons: WeaponData[], other: EquipmentItemData[]) {
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
    const node = pushAndRead(this.#weapons, { ...equipmentNode(init), attack: null });
    return new EquipmentItemBO(node, this.#weapons);
  }

  addOther(init: NewEquipmentItem): EquipmentItemBO {
    const node = pushAndRead(this.#other, equipmentNode(init));
    return new EquipmentItemBO(node, this.#other);
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

function equipmentNode({
  name,
  description = '',
  attuned = false,
  equipped = false,
}: NewEquipmentItem): EquipmentItemData {
  return {
    id: createId(),
    name: trimmedName(name),
    description: longText(description),
    attuned,
    equipped,
  };
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
