import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SCHEMAS } from '../schema/index.js';
import { ID_A, V1_OTHER_ID, V1_WEAPON_ID, v1DocFor } from '../../test/fixtures.js';
import { parseCharacter } from './parseCharacter.js';
import { migrateV1ToV2 } from './v1ToV2.js';

interface Migrated {
  schemaVersion: number;
  equipment: { weapons: Record<string, unknown>[]; other: Record<string, unknown>[] };
  spellList: Record<string, unknown>;
  [key: string]: unknown;
}

/** A real character exported from the live app on 2026-09-24: schema v1. */
const zahir = (
  JSON.parse(
    readFileSync(
      new URL('../../../testAssets/zahir-ibn-talaar-2026-09-24.json', import.meta.url),
      'utf8',
    ),
  ) as { sheet: Record<string, unknown> }
).sheet;

describe('migrateV1ToV2', () => {
  it('adds an empty attack to each weapon and empty spellcasting, and changes nothing else', () => {
    const v1 = v1DocFor(ID_A, 'Sable');
    const v2 = migrateV1ToV2(v1) as Migrated;

    expect(v2.schemaVersion).toBe(2);
    expect(v2.equipment.weapons).toEqual([
      {
        id: V1_WEAPON_ID,
        name: 'Rapier',
        description: '+5 to hit, 1d8+3 piercing',
        attuned: false,
        equipped: true,
        attack: null,
      },
    ]);
    expect(v2.equipment.other).toEqual([
      { id: V1_OTHER_ID, name: 'Cloak', description: '', attuned: true, equipped: true },
    ]);
    expect(v2.spellList).toEqual({ categories: [], uncategorized: [], spellcasting: {} });

    // Everything the migration does not touch comes through as it was.
    const untouched = (doc: Record<string, unknown>) => {
      const rest = { ...doc };
      delete rest.schemaVersion;
      delete rest.equipment;
      delete rest.spellList;
      return rest;
    };
    expect(untouched(v2)).toEqual(untouched(v1));
  });

  it('produces a valid v2 document', () => {
    expect(SCHEMAS[2]!.safeParse(migrateV1ToV2(v1DocFor(ID_A, 'Sable'))).success).toBe(true);
  });

  it('does not mutate its input', () => {
    const v1 = v1DocFor(ID_A, 'Sable');
    const before = structuredClone(v1);
    migrateV1ToV2(v1);
    expect(v1).toEqual(before);
  });

  it('never reads an attack out of a description: the real Zahir file', () => {
    // Every weapon in this exported character says "Damage: 1dN …" in its description, which is
    // exactly the text a helpful migration would be tempted to parse.
    expect(SCHEMAS[1]!.safeParse(zahir).success).toBe(true);
    const v2 = migrateV1ToV2(zahir) as Migrated;

    expect(v2.equipment.weapons.length).toBeGreaterThan(0);
    expect(v2.equipment.weapons.every((weapon) => weapon.attack === null)).toBe(true);
    expect(SCHEMAS[2]!.safeParse(v2).success).toBe(true);
  });
});

describe('parseCharacter on a v1 document', () => {
  it('returns the migrated v2 document', () => {
    const result = parseCharacter(v1DocFor(ID_A, 'Sable'));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.doc).toEqual(migrateV1ToV2(v1DocFor(ID_A, 'Sable')));
  });
});
