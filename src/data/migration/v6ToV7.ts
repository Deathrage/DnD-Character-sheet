import type { Migration } from './migrations.js';

/**
 * v6 → v7 (2026-11-01): every generic counter gains `step: 1` — what its − and + move it by,
 * which until now was always one.
 *
 * Reads nothing else. A counter described as "counted in half hours" is the player's own note,
 * not data: the app never fills in a number the player did not enter, and a migration is no
 * exception. `current` and `total` are left as they are; every whole number a v6 counter held
 * is a valid v7 decimal.
 *
 * Last in each counter, where the business layer puts it on a new one, so a plain spread puts it
 * there. Spell slots and pact slots are not counters in this sense and are left alone. The walk
 * has already validated the input at v6, so the two buckets are known to be arrays of objects.
 *
 * Frozen once released, like the schema it produces: cloud versions are never rewritten, so a v6
 * backup goes through this function on every restore, forever. Builds new objects rather than
 * editing its input.
 */
export const migrateV6ToV7: Migration = (input) => {
  const doc = input as Record<string, unknown> & {
    counters: {
      categories: (Record<string, unknown> & { items: Record<string, unknown>[] })[];
      uncategorized: Record<string, unknown>[];
    };
  };
  const withStep = (counter: Record<string, unknown>) => ({ ...counter, step: 1 });
  return {
    ...doc,
    schemaVersion: 7,
    counters: {
      ...doc.counters,
      categories: doc.counters.categories.map((category) => ({
        ...category,
        items: category.items.map(withStep),
      })),
      uncategorized: doc.counters.uncategorized.map(withStep),
    },
  };
};
