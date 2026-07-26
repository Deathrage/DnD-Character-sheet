import { openDB, type IDBPDatabase } from 'idb';
import { CharacterLoadError, toSchemaIssues } from '../migration/errors.js';
import { parseCharacter, type LoadResult } from '../migration/parseCharacter.js';
import { CURRENT, CURRENT_SCHEMA, type CharacterDocument } from '../schema/index.js';
import { summarize } from './summarize.js';
import type { CharacterRepository, ListEntry } from './types.js';

export const DB_NAME = 'dnd-character-sheet';
export const DB_VERSION = 1;
export const CHARACTER_STORE = 'characters';

/**
 * Out-of-line keys, not a keyPath. The key must stay readable even when the
 * stored value is damaged, so a broken document can still be listed and opened.
 */
export function openDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(CHARACTER_STORE)) {
        db.createObjectStore(CHARACTER_STORE);
      }
    },
  });
}

export function createIndexedDbRepository(): CharacterRepository {
  return {
    async list(): Promise<ListEntry[]> {
      const db = await openDb();
      try {
        const entries: ListEntry[] = [];
        let cursor = await db.transaction(CHARACTER_STORE).store.openCursor();

        while (cursor) {
          // The cursor KEY identifies the row, in both branches. The store uses out-of-line
          // keys so the key survives a damaged value, and the same reasoning applies to a
          // healthy one: `get(id)` looks a row up by key, so a summary carrying the value's
          // own `id` would produce a row that cannot be opened the moment the two diverge.
          // save() keeps them equal, but the raw-JSON repair screen writes user-edited JSON.
          const id = String(cursor.key);
          const parsed = parseCharacter(cursor.value);
          entries.push(
            parsed.ok
              ? { ok: true, summary: { ...summarize(parsed.doc), id } }
              : { ok: false, id, error: parsed.error },
          );
          cursor = await cursor.continue();
        }

        return entries;
      } finally {
        db.close();
      }
    },

    async get(id: string): Promise<LoadResult | null> {
      const db = await openDb();
      try {
        const stored: unknown = await db.get(CHARACTER_STORE, id);
        if (stored === undefined) return null;
        return parseCharacter(stored);
      } finally {
        db.close();
      }
    },

    async getRaw(id: string): Promise<unknown> {
      const db = await openDb();
      try {
        return (await db.get(CHARACTER_STORE, id)) as unknown;
      } finally {
        db.close();
      }
    },

    async save(doc: CharacterDocument): Promise<void> {
      // Validate at the boundary: an invalid document must never reach storage (spec §6).
      // The refusal is reported as a CharacterLoadError, the same taxonomy every other failure
      // in this layer uses, so the business layer can render it without importing a Zod type.
      const result = CURRENT_SCHEMA.safeParse(doc);
      if (!result.success) {
        throw new CharacterLoadError({
          code: 'INVALID_AT_VERSION',
          version: CURRENT,
          issues: toSchemaIssues(result.error),
        });
      }
      const validated = result.data;

      const db = await openDb();
      try {
        await db.put(CHARACTER_STORE, validated, validated.id);
      } finally {
        db.close();
      }
    },

    async delete(id: string): Promise<void> {
      const db = await openDb();
      try {
        await db.delete(CHARACTER_STORE, id);
      } finally {
        db.close();
      }
    },
  };
}
