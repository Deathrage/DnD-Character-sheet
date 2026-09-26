import type { Migration } from './migrations.js';

/**
 * v2 → v3 (2026-09-26): the document gains a top-level `initiative`, beside `armorClass`.
 *
 * It starts at 0, which is what a new character's initiative is and what every other number on a
 * v2 sheet the player never touched already reads. It is not copied from the Dexterity modifier:
 * that would be the app working a number out, and it would be wrong for exactly the characters
 * whose initiative differs from their Dexterity — Alert, Jack of All Trades, a magic item.
 *
 * Inserted right after `armorClass`, as a blank v3 document has it: key order is what the raw-JSON
 * editor shows, and appended it would come after the whole of abilities and skills. So the
 * document is copied key by key rather than spread. The walk has already validated the input at
 * v2, so `armorClass` is known to be there.
 *
 * Frozen once released, like the schema it produces: cloud versions are never rewritten, so a v2
 * backup goes through this function on every restore, forever. Builds a new object rather than
 * editing its input.
 */
export const migrateV2ToV3: Migration = (input) => {
  const migrated: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    migrated[key] = value;
    if (key === 'armorClass') migrated.initiative = 0;
  }
  migrated.schemaVersion = 3;
  return migrated;
};
