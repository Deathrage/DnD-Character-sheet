import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { toSchemaIssues } from '../migration/errors.js';
import {
  defaultRegistry,
  parseCharacter,
  type LoadResult,
  type MigrationRegistry,
} from '../migration/parseCharacter.js';
import { CURRENT_SCHEMA, type CharacterDocument } from '../schema/index.js';
import { StorageError, toStorageFailure } from './storageFailure.js';
import { summarize } from './summarize.js';
import type { CharacterRepository, ListEntry } from './types.js';

export const DB_NAME = 'dnd-character-sheet';
export const DB_VERSION = 1;
export const CHARACTER_STORE = 'characters';

interface CharacterDb extends DBSchema {
  /** `unknown`, not `CharacterDocument`: a stored row may predate this build's schema, or be damaged. */
  characters: { key: string; value: unknown };
}

export type OpenDb = () => Promise<IDBPDatabase<CharacterDb>>;

export interface RepositoryOptions {
  registry?: MigrationRegistry;
  openDb?: OpenDb;
}

/** Not exported: a second connection opened outside the repository is what blocks a version bump. */
const defaultOpenDb: OpenDb = () =>
  openDB<CharacterDb>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(CHARACTER_STORE)) {
        db.createObjectStore(CHARACTER_STORE);
      }
    },
  });

/**
 * Routes a repository operation's rejection through the storage taxonomy, so no raw
 * `DOMException` (or anything else) escapes this module. A `StorageError` thrown deliberately
 * inside `operation` (save's SAVE_REFUSED) passes through untouched rather than being re-wrapped
 * as UNKNOWN.
 */
async function guard<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (cause) {
    if (cause instanceof StorageError) throw cause;
    throw new StorageError(toStorageFailure(cause));
  }
}

export function createIndexedDbRepository(options: RepositoryOptions = {}): CharacterRepository {
  const registry = options.registry ?? defaultRegistry;
  const openDb = options.openDb ?? defaultOpenDb;

  return {
    list(): Promise<ListEntry[]> {
      return guard(async () => {
        const db = await openDb();
        try {
          const entries: ListEntry[] = [];
          const tx = db.transaction(CHARACTER_STORE);
          let cursor = await tx.store.openCursor();

          while (cursor) {
            // The cursor KEY identifies the row, in both branches. The store uses out-of-line
            // keys so the key survives a damaged value, and the same reasoning applies to a
            // healthy one: `get(id)` looks a row up by key, so a summary carrying the value's
            // own `id` would produce a row that cannot be opened the moment the two diverge.
            // save() keeps them equal, but the raw-JSON repair screen writes user-edited JSON.
            const id = String(cursor.key);
            const parsed = parseCharacter(cursor.value, registry);
            entries.push(
              parsed.ok
                ? { ok: true, summary: { ...summarize(parsed.doc), id } }
                : { ok: false, id, error: parsed.error },
            );
            cursor = await cursor.continue();
          }

          // Awaited so an abort with no in-flight request rejects list() instead of surfacing
          // as an unhandled rejection.
          await tx.done;
          return entries;
        } finally {
          db.close();
        }
      });
    },

    get(id: string): Promise<LoadResult | null> {
      return guard(async () => {
        const db = await openDb();
        try {
          const stored = await db.get(CHARACTER_STORE, id);
          if (stored === undefined) return null;
          return parseCharacter(stored, registry);
        } finally {
          db.close();
        }
      });
    },

    getRaw(id: string): Promise<unknown> {
      return guard(async () => {
        const db = await openDb();
        try {
          return await db.get(CHARACTER_STORE, id);
        } finally {
          db.close();
        }
      });
    },

    save(doc: CharacterDocument): Promise<void> {
      return guard(async () => {
        // Validate at the boundary: an invalid document must never reach storage (spec §6).
        // Always against CURRENT_SCHEMA, not the injected registry: a save always writes the
        // current version, regardless of what registry a test supplied for reading.
        const result = CURRENT_SCHEMA.safeParse(doc);
        if (!result.success) {
          throw new StorageError({
            code: 'SAVE_REFUSED',
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
      });
    },

    delete(id: string): Promise<void> {
      return guard(async () => {
        const db = await openDb();
        try {
          await db.delete(CHARACTER_STORE, id);
        } finally {
          db.close();
        }
      });
    },
  };
}
