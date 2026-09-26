import { describe, expect, it } from 'vitest';
import { CURRENT, SCHEMAS } from '../schema/index.js';
import { ID_A, v2DocFor } from '../../test/fixtures.js';
import { parseCharacter } from './parseCharacter.js';
import { migrateV2ToV3 } from './v2ToV3.js';

interface Migrated {
  schemaVersion: number;
  initiative?: unknown;
  [key: string]: unknown;
}

describe('migrateV2ToV3', () => {
  it('adds initiative at 0 and changes nothing else', () => {
    const v2 = v2DocFor(ID_A, 'Sable');
    const v3 = migrateV2ToV3(v2) as Migrated;

    expect(v3.schemaVersion).toBe(3);
    expect(v3.initiative).toBe(0);

    // Everything the migration does not touch comes through as it was — the weapon attack and
    // spellcasting v2 added included.
    const untouched = (doc: Record<string, unknown>) => {
      const rest: Record<string, unknown> = { ...doc };
      delete rest.schemaVersion;
      delete rest.initiative;
      return rest;
    };
    expect(untouched(v3)).toEqual(untouched(v2));
  });

  it('never works initiative out from the Dexterity modifier', () => {
    // v2DocFor's Dexterity modifier is +3; 0 is what the player has entered, which is nothing.
    const v3 = migrateV2ToV3(v2DocFor(ID_A, 'Sable')) as Migrated;
    expect(v3.initiative).toBe(0);
  });

  it('puts initiative right after armorClass, where a blank v3 document has it', () => {
    // Key order is what the raw-JSON editor shows. Appended, initiative would come after the whole
    // of abilities and skills, the last thing a player scrolling for it found.
    const v3 = migrateV2ToV3(v2DocFor(ID_A, 'Sable')) as Migrated;
    expect(Object.keys(v3)).toEqual([
      'schemaVersion',
      'id',
      'name',
      'updatedAt',
      'classes',
      'hitPoints',
      'hitDices',
      'armorClass',
      'initiative',
      'journalAndNotes',
      'inventory',
      'featsAndTraits',
      'equipment',
      'spellList',
      'counters',
      'abilitiesAndSkills',
    ]);
  });

  it('produces a valid v3 document', () => {
    expect(SCHEMAS[3]!.safeParse(migrateV2ToV3(v2DocFor(ID_A, 'Sable'))).success).toBe(true);
  });

  it('does not mutate its input', () => {
    const v2 = v2DocFor(ID_A, 'Sable');
    const before = structuredClone(v2);
    migrateV2ToV3(v2);
    expect(v2).toEqual(before);
  });
});

describe('parseCharacter on a v2 document', () => {
  // Asserts this step ran, not where the chain ends, so the next version does not break it.
  it('runs it through this migration on the way to the current version', () => {
    const result = parseCharacter(v2DocFor(ID_A, 'Sable'));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.doc.schemaVersion).toBe(CURRENT);
      expect(result.doc.initiative).toBe(0);
    }
  });
});
