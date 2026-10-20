import { openDB } from 'idb';
import { createCharacter, type CharacterDocument } from '../data/schema/index.js';
import {
  CHARACTER_STORE,
  DB_NAME,
  DB_VERSION,
  upgradeCharacterDb,
  type OpenDb,
} from '../data/repository/indexedDbRepository.js';

export const ID_A = '3f1a6c2e-8b4d-4a19-9c7e-1d2b3a4c5d6e';
export const ID_B = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
export const FIXED_NOW = new Date('2026-07-25T09:41:00.000Z');

/** Advances a millisecond per call, so two cloud uploads never share an `uploadedAt`. */
export function clock(start = '2026-09-24T18:00:00.000Z'): () => Date {
  let now = Date.parse(start);
  return () => new Date(now++);
}

export function docFor(id: string, name: string): CharacterDocument {
  return createCharacter({ name, id, now: FIXED_NOW });
}

export const V1_WEAPON_ID = '66666666-6666-4666-8666-666666666666';
export const V1_OTHER_ID = '77777777-7777-4777-8777-777777777777';
const V4_WARLOCK_ID = '88888888-8888-4888-8888-888888888888';
const V4_PACT_COUNTER_ID = '99999999-9999-4999-8999-999999999999';
const V5_JAVELINS_ID = 'abababab-abab-4bab-8bab-abababababab';
const V5_JAVELIN_ITEM_ID = 'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd';

/**
 * A complete v1 document, written out by hand. `createCharacter` makes the current version, and
 * nothing outside `schema/` may import `v1/`, so a test that needs an older document spells it.
 * `fixtures.test.ts` checks it against `SCHEMAS[1]`: a migration test whose input was never valid
 * v1 would pass for the wrong reason. The weapon's description is the kind a player really
 * writes — which the migration must leave alone.
 */
export function v1DocFor(id: string, name: string): Record<string, unknown> {
  const zero = () => ({ current: 0, total: 0 });
  const abilities = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
  const skills = [
    'acrobatics',
    'animalHandling',
    'arcana',
    'athletics',
    'deception',
    'history',
    'insight',
    'intimidation',
    'investigation',
    'medicine',
    'nature',
    'perception',
    'performance',
    'persuasion',
    'religion',
    'sleightOfHand',
    'stealth',
    'survival',
  ];
  return {
    schemaVersion: 1,
    id,
    name,
    updatedAt: FIXED_NOW.toISOString(),
    classes: [],
    hitPoints: { current: 0, total: 0, temporary: 0 },
    hitDices: {},
    armorClass: 0,
    journalAndNotes: { journal: [], notes: '' },
    inventory: { coins: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 }, items: [] },
    featsAndTraits: { categories: [], uncategorized: [] },
    equipment: {
      weapons: [
        {
          id: V1_WEAPON_ID,
          name: 'Rapier',
          description: '+5 to hit, 1d8+3 piercing',
          attuned: false,
          equipped: true,
        },
      ],
      other: [{ id: V1_OTHER_ID, name: 'Cloak', description: '', attuned: true, equipped: true }],
    },
    spellList: { categories: [], uncategorized: [] },
    counters: {
      categories: [],
      uncategorized: [],
      spellSlots: Object.fromEntries(
        ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((level) => [level, zero()]),
      ),
    },
    abilitiesAndSkills: {
      proficiencyBonus: 0,
      passivePerception: 0,
      speed: 0,
      abilities: Object.fromEntries(
        abilities.map((key) => [
          key,
          { score: 0, modifier: 0, savingThrowModifier: 0, savingThrowProficient: false },
        ]),
      ),
      skills: Object.fromEntries(
        skills.map((key) => [key, { modifier: 0, proficient: false, expertise: false }]),
      ),
    },
  };
}

/**
 * A complete v2 document: `v1DocFor` with what v2 added, filled in rather than left empty — an
 * attack on the Rapier and one spellcasting entry — so a v2 → v3 test can see them come through.
 * The Dexterity modifier is +3 on purpose: a migration that worked initiative out from it would
 * show up as a 3 where a 0 belongs. `fixtures.test.ts` checks it against `SCHEMAS[2]`.
 */
export function v2DocFor(id: string, name: string): Record<string, unknown> {
  const v1 = v1DocFor(id, name) as {
    equipment: { weapons: object[]; other: object[] };
    spellList: object;
    abilitiesAndSkills: { abilities: Record<string, object> };
  };
  return {
    ...v1,
    schemaVersion: 2,
    equipment: {
      ...v1.equipment,
      weapons: v1.equipment.weapons.map((weapon) => ({
        ...weapon,
        attack: { ability: 'dexterity', attackBonus: 5, damage: '1d8+3 piercing' },
      })),
    },
    spellList: { ...v1.spellList, spellcasting: { intelligence: { attackBonus: 5, saveDc: 13 } } },
    abilitiesAndSkills: {
      ...v1.abilitiesAndSkills,
      abilities: {
        ...v1.abilitiesAndSkills.abilities,
        dexterity: { score: 16, modifier: 3, savingThrowModifier: 3, savingThrowProficient: false },
      },
    },
  };
}

/**
 * A complete v3 document: `v2DocFor` with the initiative v3 added, filled in (+4) rather than
 * left at 0, right after `armorClass` where v3 keeps it. Its current hit points are 0 of 24 on
 * purpose: a v3 → v4 migration that ticked a death save because the character was down would
 * show up here. `fixtures.test.ts` checks it against `SCHEMAS[3]`.
 */
export function v3DocFor(id: string, name: string): Record<string, unknown> {
  const v3: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(v2DocFor(id, name))) {
    v3[key] = value;
    if (key === 'armorClass') v3.initiative = 4;
  }
  v3.schemaVersion = 3;
  v3.hitPoints = { current: 0, total: 24, temporary: 3 };
  return v3;
}

/**
 * A complete v4 document: `v3DocFor` with the death saves v4 added, ticked (one success, two
 * failures) rather than left at 0, plus a Warlock class and a counter the player named "Pact
 * Magic". Those two are bait: a v4 → v5 migration that filled in pact slots from either would
 * show up here. `fixtures.test.ts` checks it against `SCHEMAS[4]`.
 */
export function v4DocFor(id: string, name: string): Record<string, unknown> {
  const v3 = v3DocFor(id, name) as {
    classes: object[];
    hitPoints: object;
    counters: { uncategorized: object[] };
  };
  return {
    ...v3,
    schemaVersion: 4,
    classes: [...v3.classes, { id: V4_WARLOCK_ID, name: 'Warlock', level: 5 }],
    hitPoints: { ...v3.hitPoints, deathSaves: { successes: 1, failures: 2 } },
    counters: {
      ...v3.counters,
      uncategorized: [
        ...v3.counters.uncategorized,
        {
          id: V4_PACT_COUNTER_ID,
          name: 'Pact Magic',
          description: 'Two 3rd-level slots, back on a short rest.',
          current: 1,
          total: 2,
        },
      ],
    },
  };
}

/**
 * A complete v5 document: `v4DocFor` with the pact slots v5 added, filled in (3rd level, 1 of 2)
 * rather than left empty, plus a weapon "Javelins" described as "5 javelins" and an inventory
 * item "Javelins" counting 5. Those two are bait: a v5 → v6 migration that filled in a weapon's
 * count from either would show up here. `fixtures.test.ts` checks it against `SCHEMAS[5]`.
 */
export function v5DocFor(id: string, name: string): Record<string, unknown> {
  const v4 = v4DocFor(id, name) as {
    inventory: { items: object[] };
    equipment: { weapons: object[] };
    counters: object;
  };
  return {
    ...v4,
    schemaVersion: 5,
    inventory: {
      ...v4.inventory,
      items: [
        ...v4.inventory.items,
        { id: V5_JAVELIN_ITEM_ID, name: 'Javelins', description: '', count: 5 },
      ],
    },
    equipment: {
      ...v4.equipment,
      weapons: [
        ...v4.equipment.weapons,
        {
          id: V5_JAVELINS_ID,
          name: 'Javelins',
          description: '5 javelins',
          attuned: false,
          equipped: true,
          attack: { ability: 'strength', attackBonus: 5, damage: '1d6+3 piercing' },
        },
      ],
    },
    counters: { ...v4.counters, pactSlots: { level: 3, current: 1, total: 2 } },
  };
}

/**
 * The tests' own opener, so the repository need not export `openDb` itself — a second connection
 * opened outside the repository is what blocks a version bump in an installed PWA. It shares the
 * real opener's `upgradeCharacterDb`, so a future change to the object store cannot silently
 * diverge this test database from the real one.
 */
export const createOpener = (): OpenDb => () =>
  openDB(DB_NAME, DB_VERSION, { upgrade: upgradeCharacterDb });

/**
 * Writes a value straight into the store, bypassing validation, to simulate damage.
 * try/finally, so a rejected put closes the connection instead of leaking it — a leaked
 * handle is exactly what would block the next test's `wipe()`.
 */
export async function putRaw(id: string, value: unknown): Promise<void> {
  const db = await createOpener()();
  try {
    await db.put(CHARACTER_STORE, value, id);
  } finally {
    db.close();
  }
}

/**
 * Deletes the database between tests. Rejects rather than resolves on `blocked`: blocked means
 * an open connection is holding the database, so the delete has NOT happened and may complete
 * later, mid-test, wiping the store out from under whatever is running. Resolving there turned
 * a leaked connection into an intermittent, far-away failure; rejecting fails loudly at the leak.
 */
export async function wipe(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error('deleteDatabase was blocked — a connection was left open by a test'));
  });
}
