import { describe, expect, it } from 'vitest';
import { autorun } from 'mobx';
import { createCharacter } from '../data/schema/index.js';
import { CharacterSheetBO } from './characterSheet.js';

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
