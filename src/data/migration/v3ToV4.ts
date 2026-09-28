import type { Migration } from './migrations.js';

/**
 * v3 → v4 (2026-09-27): hit points gain `deathSaves`, `{ successes: 0, failures: 0 }`.
 *
 * Nothing ticked, whatever the hit points read: a v3 sheet had nowhere to tick a box, so the
 * player has ticked none. A character stored at 0 hit points is not given a failure or anything
 * else — the app never ticks a death save itself, and a migration is no exception.
 *
 * Last in `hitPoints`, as a blank v4 document has it, so a plain spread puts it there. The walk has
 * already validated the input at v3, so `hitPoints` is known to be an object.
 *
 * Frozen once released, like the schema it produces: cloud versions are never rewritten, so a v3
 * backup goes through this function on every restore, forever. Builds new objects rather than
 * editing its input.
 */
export const migrateV3ToV4: Migration = (input) => {
  const doc = input as Record<string, unknown> & { hitPoints: Record<string, unknown> };
  return {
    ...doc,
    schemaVersion: 4,
    hitPoints: { ...doc.hitPoints, deathSaves: { successes: 0, failures: 0 } },
  };
};
