import type { Migration } from './migrations.js';

/**
 * v7 → v8 (2026-11-08): the document gains `companions: []` — familiars, mounts and the like,
 * each a small sheet of its own.
 *
 * Reads nothing else. A Ranger class, a Find Familiar spell, a feat or a counter named "Owl HP"
 * is the player's own note, not data: the app never fills in what the player did not enter, and
 * a migration is no exception. Every v7 character starts with none.
 *
 * Last in the document, where a blank v8 has it, so a plain spread puts it there. The walk has
 * already validated the input at v7.
 *
 * Frozen once released, like the schema it produces: cloud versions are never rewritten, so a v7
 * backup goes through this function on every restore, forever. Builds a new object rather than
 * editing its input.
 */
export const migrateV7ToV8: Migration = (input) => ({
  ...(input as Record<string, unknown>),
  schemaVersion: 8,
  companions: [],
});
