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

export function docFor(id: string, name: string): CharacterDocument {
  return createCharacter({ name, id, now: FIXED_NOW });
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
