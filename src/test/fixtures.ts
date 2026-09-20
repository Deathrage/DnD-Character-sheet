import { createCharacter, type CharacterDocument } from '../data/schema/index.js';
import { DB_NAME } from '../data/repository/indexedDbRepository.js';

export const ID_A = '3f1a6c2e-8b4d-4a19-9c7e-1d2b3a4c5d6e';
export const ID_B = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
export const FIXED_NOW = new Date('2026-07-25T09:41:00.000Z');

export function docFor(id: string, name: string): CharacterDocument {
  return createCharacter({ name, id, now: FIXED_NOW });
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
