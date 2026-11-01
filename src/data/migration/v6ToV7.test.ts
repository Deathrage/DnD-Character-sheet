import { describe, expect, it } from 'vitest';
import { CURRENT, SCHEMAS } from '../schema/index.js';
import { ID_A, v6DocFor } from '../../test/fixtures.js';
import { parseCharacter } from './parseCharacter.js';
import { migrateV6ToV7 } from './v6ToV7.js';

type Counter = Record<string, unknown>;
interface Counters {
  counters: {
    categories: { name: string; items: Counter[] }[];
    uncategorized: Counter[];
    spellSlots: Record<string, unknown>;
    pactSlots: Record<string, unknown>;
  };
  [key: string]: unknown;
}

const every = (doc: Counters): Counter[] => [
  ...doc.counters.uncategorized,
  ...doc.counters.categories.flatMap((category) => category.items),
];

describe('migrateV6ToV7', () => {
  it('gives every counter a step of 1 and changes nothing else', () => {
    const v6 = v6DocFor(ID_A, 'Sable') as Counters;
    // Everything the migration does not touch comes through as it was, the weapon counts v6
    // added included.
    expect(migrateV6ToV7(v6)).toEqual({
      ...v6,
      schemaVersion: 7,
      counters: {
        ...v6.counters,
        categories: v6.counters.categories.map((category) => ({
          ...category,
          items: category.items.map((item) => ({ ...item, step: 1 })),
        })),
        uncategorized: v6.counters.uncategorized.map((item) => ({ ...item, step: 1 })),
      },
    });
  });

  it('reaches counters in every category and in uncategorized alike', () => {
    const v6 = v6DocFor(ID_A, 'Sable') as Counters;
    // Both buckets are really populated, so the assertion below means something.
    expect(v6.counters.uncategorized.length).toBeGreaterThan(0);
    expect(v6.counters.categories.map((category) => category.items.length)).toContain(1);

    const v7 = migrateV6ToV7(v6) as Counters;
    expect(every(v7).map((counter) => counter.step)).toEqual(every(v6).map(() => 1));
  });

  it('reads no description: "half hours" is a note, not a step', () => {
    const v6 = v6DocFor(ID_A, 'Sable') as Counters;
    expect(every(v6).map((counter) => counter.description)).toContain('Counted in half hours.');

    const v7 = migrateV6ToV7(v6) as Counters;
    const oil = every(v7).find((counter) => counter.name === 'Lantern oil');
    expect(oil?.step).toBe(1);
  });

  it('puts the step last in each counter, and leaves the slots alone', () => {
    // Key order is what the raw-JSON editor shows; a new counter has its step last too.
    const v6 = v6DocFor(ID_A, 'Sable') as Counters;
    const v7 = migrateV6ToV7(v6) as Counters;
    for (const counter of every(v7)) {
      expect(Object.keys(counter).at(-1)).toBe('step');
    }
    expect(v7.counters.spellSlots).toEqual(v6.counters.spellSlots);
    expect(v7.counters.pactSlots).toEqual(v6.counters.pactSlots);
    expect(Object.keys(v7.counters)).toEqual(Object.keys(v6.counters));
  });

  it('produces a valid v7 document', () => {
    expect(SCHEMAS[7]!.safeParse(migrateV6ToV7(v6DocFor(ID_A, 'Sable'))).success).toBe(true);
  });

  it('does not mutate its input', () => {
    const v6 = v6DocFor(ID_A, 'Sable');
    const before = structuredClone(v6);
    migrateV6ToV7(v6);
    expect(v6).toEqual(before);
  });
});

describe('parseCharacter on a v6 document', () => {
  // Asserts this step ran, not where the chain ends, so the next version does not break it.
  it('runs it through this migration on the way to the current version', () => {
    const result = parseCharacter(v6DocFor(ID_A, 'Sable'));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.doc.schemaVersion).toBe(CURRENT);
      const steps = every(result.doc as unknown as Counters).map((counter) => counter.step);
      expect(steps).toEqual(every(v6DocFor(ID_A, 'Sable') as Counters).map(() => 1));
      expect(steps.length).toBeGreaterThan(1);
      expect(result.doc.equipment.weapons.map((weapon) => weapon.count)).toEqual([null, 5]);
    }
  });
});
