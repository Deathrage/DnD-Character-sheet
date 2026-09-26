import type { Migration } from './migrations.js';

/**
 * Only the parts of a v2 document this step touches, restated structurally: nothing outside
 * `src/data/schema/` may import a version directory, and the walk has already validated the
 * input at v2, so this describes what is known to be there rather than checking it.
 */
interface V2Shape {
  schemaVersion: 2;
  abilitiesAndSkills: { abilities: object; skills: object };
}

/**
 * v2 → v3 (2026-09-26): abilities and skills gain `initiative`.
 *
 * It starts at 0, which is what a new character's initiative is and what every other number on a
 * v2 sheet the player never touched already reads. It is not copied from the Dexterity modifier:
 * that would be the app working a number out, and it would be wrong for exactly the characters
 * whose initiative differs from their Dexterity — Alert, Jack of All Trades, a magic item.
 *
 * Placed before `abilities`, beside `speed`, as a blank v3 document has it: key order is what the
 * raw-JSON editor shows, and after eighteen skills it would be the last thing a player found.
 *
 * Frozen once released, like the schema it produces: cloud versions are never rewritten, so a v2
 * backup goes through this function on every restore, forever. Builds new objects rather than
 * editing its input.
 */
export const migrateV2ToV3: Migration = (input) => {
  const doc = input as V2Shape;
  const { abilities, skills, ...rest } = doc.abilitiesAndSkills;
  return {
    ...doc,
    schemaVersion: 3,
    abilitiesAndSkills: { ...rest, initiative: 0, abilities, skills },
  };
};
