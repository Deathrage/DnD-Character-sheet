import type { Migration } from './migrations.js';

/**
 * v5 → v6 (2026-10-20): every weapon gains `count: null` — not stackable.
 *
 * Reads nothing else. A weapon described as "5 javelins", or an inventory item of the same name,
 * is the player's own note, not data: the app never fills in a number the player did not enter,
 * and a migration is no exception.
 *
 * Last in each weapon, where the business layer puts it on a new one, so a plain spread puts it
 * there. Other equipment has no count and is left alone. The walk has already validated the
 * input at v5, so `equipment.weapons` is known to be an array of objects.
 *
 * Frozen once released, like the schema it produces: cloud versions are never rewritten, so a v5
 * backup goes through this function on every restore, forever. Builds new objects rather than
 * editing its input.
 */
export const migrateV5ToV6: Migration = (input) => {
  const doc = input as Record<string, unknown> & {
    equipment: { weapons: Record<string, unknown>[] };
  };
  return {
    ...doc,
    schemaVersion: 6,
    equipment: {
      ...doc.equipment,
      weapons: doc.equipment.weapons.map((weapon) => ({ ...weapon, count: null })),
    },
  };
};
