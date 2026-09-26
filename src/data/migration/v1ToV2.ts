import type { Migration } from './migrations.js';

/**
 * Only the parts of a v1 document this step touches, restated structurally: nothing outside
 * `src/data/schema/` may import a version directory, and the walk has already validated the
 * input at v1, so this describes what is known to be there rather than checking it.
 */
interface V1Shape {
  schemaVersion: 1;
  equipment: { weapons: object[]; other: object[] };
  spellList: object;
}

/**
 * v1 → v2 (2026-09-26): weapons gain `attack`, the spell list gains `spellcasting`.
 *
 * Both start empty — `attack: null`, `spellcasting: {}` — because a v1 document said nothing
 * about either, and anything else would be the app inventing a number the player never entered.
 * No description is read: "Damage: 1d8 Slashing" in one is the player's note, and parsing it would
 * be a silent rewrite of their sheet.
 *
 * Frozen once released, like the schema it produces: cloud versions are never rewritten, so a v1
 * backup goes through this function on every restore, forever. Builds new objects rather than
 * editing its input.
 */
export const migrateV1ToV2: Migration = (input) => {
  const doc = input as V1Shape;
  return {
    ...doc,
    schemaVersion: 2,
    equipment: {
      ...doc.equipment,
      weapons: doc.equipment.weapons.map((weapon) => ({ ...weapon, attack: null })),
    },
    spellList: { ...doc.spellList, spellcasting: {} },
  };
};
