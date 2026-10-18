import type { Migration } from './migrations.js';

/**
 * v4 → v5 (2026-10-18): counters gain `pactSlots`, `{ level: 1, current: 0, total: 0 }` — no
 * pact slots.
 *
 * Reads nothing else. A "Warlock" class row, or a counter the player named "Pact Magic", is the
 * player's own note, not data: the app never fills in a number the player did not enter, and a
 * migration is no exception.
 *
 * Last in `counters`, as a blank v5 document has it, so a plain spread puts it there. The walk has
 * already validated the input at v4, so `counters` is known to be an object.
 *
 * Frozen once released, like the schema it produces: cloud versions are never rewritten, so a v4
 * backup goes through this function on every restore, forever. Builds new objects rather than
 * editing its input.
 */
export const migrateV4ToV5: Migration = (input) => {
  const doc = input as Record<string, unknown> & { counters: Record<string, unknown> };
  return {
    ...doc,
    schemaVersion: 5,
    counters: { ...doc.counters, pactSlots: { level: 1, current: 0, total: 0 } },
  };
};
