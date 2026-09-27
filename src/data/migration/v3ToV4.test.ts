import { describe, expect, it } from 'vitest';
import { CURRENT, SCHEMAS } from '../schema/index.js';
import { ID_A, v3DocFor } from '../../test/fixtures.js';
import { parseCharacter } from './parseCharacter.js';
import { migrateV3ToV4 } from './v3ToV4.js';

interface Migrated {
  schemaVersion: number;
  hitPoints: Record<string, unknown>;
  [key: string]: unknown;
}

describe('migrateV3ToV4', () => {
  it('adds untouched death saves to hit points and changes nothing else', () => {
    const v3 = v3DocFor(ID_A, 'Sable');
    const v4 = migrateV3ToV4(v3) as Migrated;

    expect(v4.schemaVersion).toBe(4);
    expect(v4.hitPoints).toEqual({
      current: 0,
      total: 24,
      temporary: 3,
      deathSaves: { successes: 0, failures: 0 },
    });

    // Everything the migration does not touch comes through as it was, the initiative v3 added
    // included.
    const untouched = (doc: Record<string, unknown>) => {
      const rest: Record<string, unknown> = { ...doc };
      delete rest.schemaVersion;
      delete rest.hitPoints;
      return rest;
    };
    expect(untouched(v4)).toEqual(untouched(v3));
  });

  it('never ticks a box for a character already at 0 hit points', () => {
    // v3DocFor is at 0 of 24. The player has ticked nothing, because v3 had nowhere to tick it.
    const v4 = migrateV3ToV4(v3DocFor(ID_A, 'Sable')) as Migrated;
    expect(v4.hitPoints.deathSaves).toEqual({ successes: 0, failures: 0 });
  });

  it('puts death saves last in hit points, where a blank v4 document has them', () => {
    // Key order is what the raw-JSON editor shows.
    const v4 = migrateV3ToV4(v3DocFor(ID_A, 'Sable')) as Migrated;
    expect(Object.keys(v4.hitPoints)).toEqual(['current', 'total', 'temporary', 'deathSaves']);
    expect(Object.keys(v4)).toEqual(Object.keys(v3DocFor(ID_A, 'Sable')));
  });

  it('produces a valid v4 document', () => {
    expect(SCHEMAS[4]!.safeParse(migrateV3ToV4(v3DocFor(ID_A, 'Sable'))).success).toBe(true);
  });

  it('does not mutate its input', () => {
    const v3 = v3DocFor(ID_A, 'Sable');
    const before = structuredClone(v3);
    migrateV3ToV4(v3);
    expect(v3).toEqual(before);
  });
});

describe('parseCharacter on a v3 document', () => {
  // Asserts this step ran, not where the chain ends, so the next version does not break it.
  it('runs it through this migration on the way to the current version', () => {
    const result = parseCharacter(v3DocFor(ID_A, 'Sable'));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.doc.schemaVersion).toBe(CURRENT);
      expect(result.doc.hitPoints.deathSaves).toEqual({ successes: 0, failures: 0 });
      expect(result.doc.initiative).toBe(4);
    }
  });
});
