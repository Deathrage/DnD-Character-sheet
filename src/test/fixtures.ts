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
