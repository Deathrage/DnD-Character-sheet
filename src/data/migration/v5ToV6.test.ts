import { describe, expect, it } from 'vitest';
import { CURRENT, SCHEMAS } from '../schema/index.js';
import { ID_A, v5DocFor } from '../../test/fixtures.js';
import { parseCharacter } from './parseCharacter.js';
import { migrateV5ToV6 } from './v5ToV6.js';

interface Weapons {
  equipment: { weapons: Record<string, unknown>[]; other: Record<string, unknown>[] };
  [key: string]: unknown;
}

describe('migrateV5ToV6', () => {
  it('gives every weapon a null count and changes nothing else', () => {
    const v5 = v5DocFor(ID_A, 'Sable') as Weapons;
    // Everything the migration does not touch comes through as it was, the pact slots v5 added
    // included.
    expect(migrateV5ToV6(v5)).toEqual({
      ...v5,
      schemaVersion: 6,
      equipment: {
        ...v5.equipment,
        weapons: v5.equipment.weapons.map((weapon) => ({ ...weapon, count: null })),
      },
    });
  });

  it('reads neither a weapon description nor an inventory item of the same name', () => {
    const v5 = v5DocFor(ID_A, 'Sable') as Weapons & { inventory: { items: { name: string }[] } };
    // The bait is really there, so the assertion below means something.
    expect(v5.equipment.weapons.map((weapon) => weapon.description)).toContain('5 javelins');
    expect(v5.inventory.items.map((item) => item.name)).toContain('Javelins');

    const v6 = migrateV5ToV6(v5) as Weapons;
    expect(v6.equipment.weapons.map((weapon) => weapon.count)).toEqual([null, null]);
  });

  it('puts the count last in each weapon, and gives other equipment none', () => {
    // Key order is what the raw-JSON editor shows; a new weapon has its count last too.
    const v6 = migrateV5ToV6(v5DocFor(ID_A, 'Sable')) as Weapons;
    for (const weapon of v6.equipment.weapons) {
      expect(Object.keys(weapon).at(-1)).toBe('count');
    }
    expect(v6.equipment.other[0]).not.toHaveProperty('count');
  });

  it('produces a valid v6 document', () => {
    expect(SCHEMAS[6]!.safeParse(migrateV5ToV6(v5DocFor(ID_A, 'Sable'))).success).toBe(true);
  });

  it('does not mutate its input', () => {
    const v5 = v5DocFor(ID_A, 'Sable');
    const before = structuredClone(v5);
    migrateV5ToV6(v5);
    expect(v5).toEqual(before);
  });
});

describe('parseCharacter on a v5 document', () => {
  // Asserts this step ran, not where the chain ends, so the next version does not break it.
  it('runs it through this migration on the way to the current version', () => {
    const result = parseCharacter(v5DocFor(ID_A, 'Sable'));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.doc.schemaVersion).toBe(CURRENT);
      expect(result.doc.equipment.weapons.map((weapon) => weapon.count)).toEqual([null, null]);
      expect(result.doc.counters.pactSlots).toEqual({ level: 3, current: 1, total: 2 });
    }
  });
});
