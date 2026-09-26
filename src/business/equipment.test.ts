import { describe, expect, it } from 'vitest';
import { autorun } from 'mobx';
import { createCharacter } from '../data/schema/index.js';
import { CharacterSheetBO } from './characterSheet.js';
import { WeaponBO } from './equipment.js';
import { RuleViolation } from './errors.js';

const sheetFor = () =>
  new CharacterSheetBO(
    createCharacter({
      name: 'Sable',
      id: '3f1a6c2e-8b4d-4a19-9c7e-1d2b3a4c5d6e',
      now: new Date('2026-07-25T09:41:00.000Z'),
    }),
  );

describe('EquipmentBO', () => {
  it('starts with both lists empty', () => {
    const { equipment } = sheetFor();
    expect([equipment.weapons, equipment.other]).toEqual([[], []]);
  });

  it('adds to weapons and to other independently', () => {
    const sheet = sheetFor();
    sheet.equipment.addWeapon({ name: 'Rapier' });
    sheet.equipment.addOther({ name: 'Cloak of Elvenkind' });

    expect(sheet.equipment.weapons.map((item) => item.name)).toEqual(['Rapier']);
    expect(sheet.equipment.other.map((item) => item.name)).toEqual(['Cloak of Elvenkind']);
  });

  it('defaults both flags to false', () => {
    const item = sheetFor().equipment.addWeapon({ name: 'Rapier' });
    expect([item.attuned, item.equipped]).toEqual([false, false]);
  });

  // Derived views over both lists. Never stored — spec section 2.6 keeps them off the document.
  it('derives attuned across weapons and other', () => {
    const sheet = sheetFor();
    sheet.equipment.addWeapon({ name: 'Rapier', attuned: true });
    sheet.equipment.addOther({ name: 'Cloak', attuned: true });
    sheet.equipment.addOther({ name: 'Rations' });

    expect(sheet.equipment.attuned.map((item) => item.name)).toEqual(['Rapier', 'Cloak']);
  });

  it('derives equipped across weapons and other', () => {
    const sheet = sheetFor();
    sheet.equipment.addWeapon({ name: 'Rapier', equipped: true });
    sheet.equipment.addOther({ name: 'Cloak' });

    expect(sheet.equipment.equipped.map((item) => item.name)).toEqual(['Rapier']);
  });

  it('updates the derived view when a flag is toggled', () => {
    const sheet = sheetFor();
    const rapier = sheet.equipment.addWeapon({ name: 'Rapier' });
    const seen: number[] = [];
    const stop = autorun(() => seen.push(sheet.equipment.equipped.length));

    rapier.setEquipped(true);

    expect(seen).toEqual([0, 1]);
    stop();
  });

  // The app does not cap attunement at three or check whether armour can be worn. It computes
  // nothing — that is the point.
  it('does not cap attunement, because the app enforces no rules', () => {
    const sheet = sheetFor();
    for (const name of ['A', 'B', 'C', 'D']) {
      sheet.equipment.addOther({ name, attuned: true });
    }
    expect(sheet.equipment.attuned).toHaveLength(4);
  });

  it('keeps the derived views out of the saved document', () => {
    const sheet = sheetFor();
    sheet.equipment.addWeapon({ name: 'Rapier', attuned: true });

    const { equipment } = sheet.toDocument();
    expect(equipment).not.toHaveProperty('attuned');
    expect(equipment).not.toHaveProperty('equipped');
    expect(Object.keys(equipment)).toEqual(['weapons', 'other']);
  });

  it('removes a weapon without touching the other list', () => {
    const sheet = sheetFor();
    const rapier = sheet.equipment.addWeapon({ name: 'Rapier' });
    sheet.equipment.addOther({ name: 'Cloak' });

    rapier.remove();

    expect(sheet.equipment.weapons).toEqual([]);
    expect(sheet.equipment.other).toHaveLength(1);
  });

  // Guards against the detached-literal hazard `pushAndRead` fixes: the object returned by
  // addWeapon() must be wired to the SAME node the document holds, not a plain literal that
  // MobX cloned away at push time. Reading the return value alone is not sufficient proof —
  // that passed even while the bug was live, because the clone kept its own copy of the write.
  it('a write through the object addWeapon() returned reaches toDocument()', () => {
    const sheet = sheetFor();
    const rapier = sheet.equipment.addWeapon({ name: 'Rapier' });

    rapier.setEquipped(true);

    expect(sheet.toDocument().equipment.weapons[0]).toMatchObject({ equipped: true });
  });
});

const code = (run: () => void): string | undefined => {
  try {
    run();
  } catch (error) {
    if (error instanceof RuleViolation) return error.code;
    throw error;
  }
  return undefined;
};

describe('WeaponBO', () => {
  it('starts with no attack', () => {
    expect(sheetFor().equipment.addWeapon({ name: 'Rapier' }).attack).toBeNull();
  });

  it('creates the attack when the first ability is chosen, at +0 with no damage', () => {
    const rapier = sheetFor().equipment.addWeapon({ name: 'Rapier' });
    rapier.setAttackAbility('dexterity');
    expect(rapier.attack).toEqual({ ability: 'dexterity', attackBonus: 0, damage: '' });
  });

  it('keeps the bonus and damage when the ability changes', () => {
    const rapier = sheetFor().equipment.addWeapon({ name: 'Rapier' });
    rapier.setAttackAbility('strength');
    rapier.setAttackBonus(6);
    rapier.setAttackDamage('1d8+3 piercing');
    rapier.setAttackAbility('dexterity');
    expect(rapier.attack).toEqual({
      ability: 'dexterity',
      attackBonus: 6,
      damage: '1d8+3 piercing',
    });
  });

  it('clears the whole attack, bonus and damage included, when the ability is cleared', () => {
    const sheet = sheetFor();
    const rapier = sheet.equipment.addWeapon({ name: 'Rapier' });
    rapier.setAttackAbility('dexterity');
    rapier.setAttackBonus(6);
    rapier.setAttackAbility(null);
    expect(rapier.attack).toBeNull();
    expect(sheet.toDocument().equipment.weapons[0]?.attack).toBeNull();
  });

  it.each([
    ['an attack bonus', (weapon: WeaponBO) => weapon.setAttackBonus(1)],
    ['damage', (weapon: WeaponBO) => weapon.setAttackDamage('1d4')],
  ])('refuses %s before an ability is chosen (NO_ATTACK)', (_label, write) => {
    const rapier = sheetFor().equipment.addWeapon({ name: 'Rapier' });
    expect(code(() => write(rapier))).toBe('NO_ATTACK');
    expect(rapier.attack).toBeNull();
  });

  it('reports a bad bonus as NOT_AN_INTEGER even when there is no attack yet', () => {
    const rapier = sheetFor().equipment.addWeapon({ name: 'Rapier' });
    expect(code(() => rapier.setAttackBonus(1.5))).toBe('NOT_AN_INTEGER');
  });

  it('accepts a negative attack bonus', () => {
    const rapier = sheetFor().equipment.addWeapon({ name: 'Rapier' });
    rapier.setAttackAbility('strength');
    rapier.setAttackBonus(-1);
    expect(rapier.attack?.attackBonus).toBe(-1);
  });

  it('refuses an ability that is not one of the six', () => {
    const rapier = sheetFor().equipment.addWeapon({ name: 'Rapier' });
    expect(code(() => rapier.setAttackAbility('luck' as never))).toBe('UNKNOWN_ABILITY');
    expect(rapier.attack).toBeNull();
  });

  it('trims damage, allows it empty, and caps it at 80 characters', () => {
    const rapier = sheetFor().equipment.addWeapon({ name: 'Rapier' });
    rapier.setAttackAbility('dexterity');
    rapier.setAttackDamage('  1d8+3 piercing  ');
    expect(rapier.attack?.damage).toBe('1d8+3 piercing');
    rapier.setAttackDamage('');
    expect(rapier.attack?.damage).toBe('');
    expect(code(() => rapier.setAttackDamage('x'.repeat(81)))).toBe('TOO_LONG');
  });

  it('hands out a copy of the attack, never the stored object', () => {
    const sheet = sheetFor();
    const rapier = sheet.equipment.addWeapon({
      name: 'Rapier',
      attack: { ability: 'dexterity', attackBonus: 6, damage: '' },
    });
    (rapier.attack as { attackBonus: number }).attackBonus = 99;
    expect(sheet.toDocument().equipment.weapons[0]?.attack?.attackBonus).toBe(6);
  });

  it("stores a copy of a new attack, never the caller's object", () => {
    const sheet = sheetFor();
    const attack = { ability: 'dexterity' as const, attackBonus: 6, damage: ' 1d8 ' };
    sheet.equipment.addWeapon({ name: 'Rapier', attack });
    attack.attackBonus = 99;
    expect(sheet.toDocument().equipment.weapons[0]?.attack).toEqual({
      ability: 'dexterity',
      attackBonus: 6,
      damage: '1d8',
    });
  });

  it('adds nothing when the new attack is invalid', () => {
    const sheet = sheetFor();
    const bad = { ability: 'luck' as never, attackBonus: 1, damage: '' };
    expect(code(() => sheet.equipment.addWeapon({ name: 'Rapier', attack: bad }))).toBe(
      'UNKNOWN_ABILITY',
    );
    expect(sheet.equipment.weapons).toEqual([]);
  });

  it('never gives other equipment an attack key', () => {
    const sheet = sheetFor();
    sheet.equipment.addOther({ name: 'Cloak' });
    expect(sheet.toDocument().equipment.other[0]).not.toHaveProperty('attack');
  });

  it('keeps weapons as WeaponBO inside the derived lists', () => {
    const sheet = sheetFor();
    sheet.equipment.addWeapon({ name: 'Rapier', equipped: true, attuned: true });
    expect(sheet.equipment.equipped[0]).toBeInstanceOf(WeaponBO);
    expect(sheet.equipment.attuned[0]).toBeInstanceOf(WeaponBO);
  });
});
