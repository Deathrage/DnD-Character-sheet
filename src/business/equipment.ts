import type { AbilityKey } from './abilitiesAndSkills.js';
import { createId } from './createId.js';
import { RuleViolation } from './errors.js';
import {
  abilityKey,
  damageText,
  integer,
  longText,
  nonNegativeInt,
  trimmedName,
} from './guards.js';
import { NamedItemBO } from './namedItem.js';
import { pushAndRead } from './observableList.js';
import type { EquipmentItemData, WeaponAttackData, WeaponData } from './types.js';

export interface NewEquipmentItem {
  name: string;
  description?: string;
  attuned?: boolean;
  equipped?: boolean;
}

/** A weapon's attack roll as the player wrote it: the ability, the bonus, the damage. */
export interface WeaponAttack {
  ability: AbilityKey;
  attackBonus: number;
  damage: string;
}

export interface NewWeapon extends NewEquipmentItem {
  /** Absent or `null`: no attack roll entered yet. */
  attack?: WeaponAttack | null;
  /** Absent or `null`: not stackable. */
  count?: number | null;
}

export class EquipmentBO {
  readonly #weapons: WeaponData[];
  readonly #other: EquipmentItemData[];

  constructor(weapons: WeaponData[], other: EquipmentItemData[]) {
    this.#weapons = weapons;
    this.#other = other;
  }

  get weapons(): WeaponBO[] {
    return this.#weapons.map((node) => new WeaponBO(node, this.#weapons));
  }

  get other(): EquipmentItemBO[] {
    return this.#other.map((node) => new EquipmentItemBO(node, this.#other));
  }

  addWeapon({ attack = null, count = null, ...init }: NewWeapon): WeaponBO {
    // Checked before anything is pushed, so a bad attack or count leaves no half-made weapon.
    const checkedAttack = attack === null ? null : weaponAttack(attack);
    const checkedCount = count === null ? null : nonNegativeInt(count);
    const node = pushAndRead(this.#weapons, {
      ...equipmentNode(init),
      attack: checkedAttack,
      count: checkedCount,
    });
    return new WeaponBO(node, this.#weapons);
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

/** A fresh object, so the caller's literal never becomes part of the document. */
function weaponAttack({ ability, attackBonus, damage }: WeaponAttack): WeaponAttackData {
  return {
    ability: abilityKey(ability),
    attackBonus: integer(attackBonus),
    damage: damageText(damage),
  };
}

/**
 * Generic so `WeaponBO` can narrow the node it holds. Every item in `other` is exactly this;
 * every weapon is this plus an attack.
 */
export class EquipmentItemBO<
  TData extends EquipmentItemData = EquipmentItemData,
> extends NamedItemBO<TData> {
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

/**
 * A weapon carries the attack roll the player enters — the ability, the bonus, the damage — and
 * the app checks none of it against anything. Choosing an ability is what creates the attack, so
 * nothing else can be set before one is chosen, and clearing the ability clears the rest.
 *
 * It may also carry a count, for a weapon the player has several of. The count works the same
 * way: making the weapon stackable creates it, and only then can it be set.
 */
export class WeaponBO extends EquipmentItemBO<WeaponData> {
  /** `null` when no attack roll has been entered. A copy: the stored object never leaves. */
  get attack(): WeaponAttack | null {
    const { attack } = this.node;
    return attack === null ? null : { ...attack };
  }

  /**
   * A first choice starts at `+0` with no damage (spec §1, "Starting values"). A change keeps
   * both: the player picks the ability first and types the number second, and correcting the
   * first must not wipe the second.
   */
  setAttackAbility(value: AbilityKey | null): void {
    if (value === null) {
      this.node.attack = null;
      return;
    }
    const ability = abilityKey(value);
    if (this.node.attack === null) this.node.attack = { ability, attackBonus: 0, damage: '' };
    else this.node.attack.ability = ability;
  }

  /** The value is checked first, so a bad number reads as that even with no attack yet. */
  setAttackBonus(value: number): void {
    const attackBonus = integer(value);
    this.#requireAttack().attackBonus = attackBonus;
  }

  setAttackDamage(value: string): void {
    const damage = damageText(value);
    this.#requireAttack().damage = damage;
  }

  /** `null` when the weapon is not stackable; 0 is a stackable weapon with none left. */
  get count(): number | null {
    return this.node.count;
  }

  /**
   * On creates the count at 0; a weapon that already has one keeps it. Off clears it, with no
   * confirmation, as clearing the attack ability does.
   */
  setStackable(value: boolean): void {
    this.node.count = value ? (this.node.count ?? 0) : null;
  }

  /** The value is checked first, so a bad number reads as that even when not stackable. */
  setCount(value: number): void {
    const count = nonNegativeInt(value);
    if (this.node.count === null) {
      throw new RuleViolation('NOT_STACKABLE', `make ${this.name} stackable first`);
    }
    this.node.count = count;
  }

  #requireAttack(): WeaponAttackData {
    const { attack } = this.node;
    if (attack === null) {
      throw new RuleViolation('NO_ATTACK', `choose an attack ability for ${this.name} first`);
    }
    return attack;
  }
}
