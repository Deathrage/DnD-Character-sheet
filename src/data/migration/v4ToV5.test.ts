import { describe, expect, it } from 'vitest';
import { CURRENT, SCHEMAS } from '../schema/index.js';
import { ID_A, v4DocFor } from '../../test/fixtures.js';
import { parseCharacter } from './parseCharacter.js';
import { migrateV4ToV5 } from './v4ToV5.js';

interface Migrated {
  schemaVersion: number;
  counters: Record<string, unknown>;
  [key: string]: unknown;
}

const NONE = { level: 1, current: 0, total: 0 };

describe('migrateV4ToV5', () => {
  it('adds empty pact slots to counters and changes nothing else', () => {
    const v4 = v4DocFor(ID_A, 'Sable');
    const v5 = migrateV4ToV5(v4) as Migrated;

    expect(v5.schemaVersion).toBe(5);
    expect(v5.counters.pactSlots).toEqual(NONE);

    // Everything the migration does not touch comes through as it was, the death saves v4 added
    // included.
    const untouched = (doc: Record<string, unknown>) => {
      const rest: Record<string, unknown> = { ...doc };
      delete rest.schemaVersion;
      const counters = { ...(rest.counters as Record<string, unknown>) };
      delete counters.pactSlots;
      rest.counters = counters;
      return rest;
    };
    expect(untouched(v5)).toEqual(untouched(v4));
  });

  it('reads neither a Warlock class nor a counter named Pact Magic', () => {
    const v4 = v4DocFor(ID_A, 'Sable') as {
      classes: { name: string }[];
      counters: { uncategorized: { name: string }[] };
    };
    // The bait is really there, so the assertion below means something.
    expect(v4.classes.map((entry) => entry.name)).toContain('Warlock');
    expect(v4.counters.uncategorized.map((entry) => entry.name)).toContain('Pact Magic');

    expect((migrateV4ToV5(v4) as Migrated).counters.pactSlots).toEqual(NONE);
  });

  it('puts pact slots last in counters, where a blank v5 document has them', () => {
    // Key order is what the raw-JSON editor shows.
    const v4 = v4DocFor(ID_A, 'Sable');
    const v5 = migrateV4ToV5(v4) as Migrated;
    expect(Object.keys(v5.counters)).toEqual([
      'categories',
      'uncategorized',
      'spellSlots',
      'pactSlots',
    ]);
    expect(Object.keys(v5)).toEqual(Object.keys(v4));
  });

  it('produces a valid v5 document', () => {
    expect(SCHEMAS[5]!.safeParse(migrateV4ToV5(v4DocFor(ID_A, 'Sable'))).success).toBe(true);
  });

  it('does not mutate its input', () => {
    const v4 = v4DocFor(ID_A, 'Sable');
    const before = structuredClone(v4);
    migrateV4ToV5(v4);
    expect(v4).toEqual(before);
  });
});

describe('parseCharacter on a v4 document', () => {
  // Asserts this step ran, not where the chain ends, so the next version does not break it.
  it('runs it through this migration on the way to the current version', () => {
    const result = parseCharacter(v4DocFor(ID_A, 'Sable'));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.doc.schemaVersion).toBe(CURRENT);
      expect(result.doc.counters.pactSlots).toEqual(NONE);
      expect(result.doc.hitPoints.deathSaves).toEqual({ successes: 1, failures: 2 });
    }
  });
});
