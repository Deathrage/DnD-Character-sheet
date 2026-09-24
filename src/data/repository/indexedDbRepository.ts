import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { z } from 'zod';
import { toSchemaIssues } from '../migration/errors.js';
import {
  defaultRegistry,
  parseCharacter,
  type LoadResult,
  type MigrationRegistry,
} from '../migration/parseCharacter.js';
import { CURRENT_SCHEMA, type CharacterDocument } from '../schema/index.js';
import { portraitSchema } from './portrait.js';
import { StorageError, toStorageFailure, type StorageFailure } from './storageFailure.js';
import { summarize } from './summarize.js';
import type { CharacterRepository, ListEntry } from './types.js';

export const DB_NAME = 'dnd-character-sheet';
/**
 * The database's own version: its stores and their key settings, never the character schema,
 * which each document carries as `schemaVersion` and which is migrated when read. 1 → 2 added
 * `portraits`.
 */
export const DB_VERSION = 2;
export const CHARACTER_STORE = 'characters';
/** Keyed by character id, like `characters`; the value is the portrait's data URL. */
export const PORTRAIT_STORE = 'portraits';

interface CharacterDb extends DBSchema {
  /** `unknown`, not `CharacterDocument`: a stored row may predate this build's schema, or be damaged. */
  characters: { key: string; value: unknown };
  /** `unknown` for the same reason: storage is not a place this app trusts on the way out. */
  portraits: { key: string; value: unknown };
}

export type OpenDb = () => Promise<IDBPDatabase<CharacterDb>>;

export interface RepositoryOptions {
  registry?: MigrationRegistry;
  openDb?: OpenDb;
  /**
   * For failures that arrive outside any call: another tab pinning an old version, or the browser
   * terminating the connection. These cannot be rejections because no call is in flight.
   */
  onFailure?: (failure: StorageFailure) => void;
}

/**
 * Brings the database from `oldVersion` up to `DB_VERSION`, one step per version, so a browser
 * that skipped a release still runs every step it missed. Exported so the test opener in
 * `src/test/fixtures.ts` shares this instead of re-implementing it — two copies would let a
 * future change to the store's shape silently diverge the test database from the real one.
 *
 * Both stores use out-of-line keys, never a `keyPath`: a `keyPath` reads the key from the stored
 * value, so a damaged value would become unlistable and unreachable.
 */
export function upgradeCharacterDb(db: IDBPDatabase<CharacterDb>, oldVersion: number): void {
  if (oldVersion < 1) db.createObjectStore(CHARACTER_STORE);
  if (oldVersion < 2) db.createObjectStore(PORTRAIT_STORE);
}

/** Wrapped in an object so a refusal's issue path names the field: `portrait: must be …`. */
const portraitField = z.object({ portrait: portraitSchema.nullable() });

function validatedPortrait(portrait: string | null): string | null {
  const result = portraitField.safeParse({ portrait });
  if (!result.success) {
    throw new StorageError({ code: 'SAVE_REFUSED', issues: toSchemaIssues(result.error) });
  }
  return result.data.portrait;
}

/** Not exported: a second connection opened outside the repository is what blocks a version bump. */
const makeDefaultOpenDb =
  (onFailure: (failure: StorageFailure) => void): OpenDb =>
  () =>
    openDB<CharacterDb>(DB_NAME, DB_VERSION, {
      upgrade: upgradeCharacterDb,
      // Another tab holds an older version open; our upgrade cannot proceed until it closes.
      blocked: () => onFailure({ code: 'BLOCKED' }),
      // We are the old tab, blocking someone ELSE's upgrade — the exact inverse of `blocked`
      // above. Mapped to the same code deliberately, not by oversight: the player's remediation
      // is identical either way (close the other tabs), so the business layer needs only one
      // signal to act on. It is also close to unreachable here: this repository closes every
      // connection at the end of each call, so `blocking` would require another tab to start its
      // own upgrade in the narrow window while this one is still open — and even then, this
      // connection closing (moments later, when the current call finishes) resolves it without
      // any code needing to run.
      blocking: () => onFailure({ code: 'BLOCKED' }),
      // The browser dropped the connection, typically under storage pressure.
      terminated: () => onFailure({ code: 'UNAVAILABLE', cause: 'connection terminated' }),
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

const isOlderThan = (stored: unknown, current: number): boolean =>
  (stored as { schemaVersion: number }).schemaVersion < current;

export function createIndexedDbRepository(options: RepositoryOptions = {}): CharacterRepository {
  const registry = options.registry ?? defaultRegistry;
  const onFailure = options.onFailure ?? (() => {});
  const openDb = options.openDb ?? makeDefaultOpenDb(onFailure);

  /**
   * Stores documents that loaded only by migrating, so each migrates once instead of on every
   * load. Only an optimisation, so it never fails the read that triggered it: a failure goes to
   * `onFailure`. A row is replaced only if it still holds exactly what was read, re-checked in
   * the same transaction, so an autosave that landed in between is never overwritten by an
   * older document.
   */
  async function writeBack(rows: Array<{ id: string; stored: unknown; doc: unknown }>) {
    if (rows.length === 0) return;
    try {
      await guard(async () => {
        const db = await openDb();
        try {
          const tx = db.transaction(CHARACTER_STORE, 'readwrite');
          for (const { id, stored, doc } of rows) {
            const now: unknown = await tx.store.get(id);
            if (JSON.stringify(now) === JSON.stringify(stored)) await tx.store.put(doc, id);
          }
          await tx.done;
        } finally {
          db.close();
        }
      });
    } catch (caught) {
      onFailure((caught as StorageError).detail);
    }
  }

  return {
    async list(): Promise<ListEntry[]> {
      // Fetching is guarded (a storage failure here is genuinely a storage failure); parsing is
      // not. parseCharacter rethrows anything that isn't a CharacterLoadError, on purpose,
      // because that means the loader itself is buggy — see the comment on parseCharacter. A
      // parse call left inside guard() would relabel that bug a StorageError{code:'UNKNOWN'},
      // crossing the two error families.
      const rows = await guard(async () => {
        const db = await openDb();
        try {
          const collected: Array<[string, unknown]> = [];
          const portraits = new Map<string, string>();
          // One transaction over both stores, so a row and its portrait are read as of the same
          // moment rather than straddling a save.
          const tx = db.transaction([CHARACTER_STORE, PORTRAIT_STORE]);
          let cursor = await tx.objectStore(CHARACTER_STORE).openCursor();

          while (cursor) {
            // The cursor KEY identifies the row, in both branches. The store uses out-of-line
            // keys so the key survives a damaged value, and the same reasoning applies to a
            // healthy one: `get(id)` looks a row up by key, so a summary carrying the value's
            // own `id` would produce a row that cannot be opened the moment the two diverge.
            // save() keeps them equal, but the raw-JSON repair screen writes user-edited JSON.
            collected.push([String(cursor.key), cursor.value]);
            cursor = await cursor.continue();
          }

          let portrait = await tx.objectStore(PORTRAIT_STORE).openCursor();
          while (portrait) {
            if (typeof portrait.value === 'string')
              portraits.set(String(portrait.key), portrait.value);
            portrait = await portrait.continue();
          }

          // Awaited so an abort with no in-flight request rejects list() instead of surfacing
          // as an unhandled rejection.
          await tx.done;
          return { collected, portraits };
        } finally {
          db.close();
        }
      });

      const migrated: Array<{ id: string; stored: unknown; doc: unknown }> = [];
      const entries = rows.collected.map(([id, value]): ListEntry => {
        const parsed = parseCharacter(value, registry);
        if (!parsed.ok) return { ok: false, id, error: parsed.error };
        if (isOlderThan(value, registry.current))
          migrated.push({ id, stored: value, doc: parsed.doc });
        return {
          ok: true,
          summary: { ...summarize(parsed.doc, rows.portraits.get(id) ?? null), id },
        };
      });
      await writeBack(migrated);
      return entries;
    },

    async get(id: string): Promise<LoadResult | null> {
      // Same split as list() above: fetching is guarded, parsing is not, so a loader bug
      // rethrown by parseCharacter escapes as itself instead of being relabeled a StorageError.
      const stored = await guard(async () => {
        const db = await openDb();
        try {
          return await db.get(CHARACTER_STORE, id);
        } finally {
          db.close();
        }
      });
      if (stored === undefined) return null;
      const parsed = parseCharacter(stored, registry);
      if (parsed.ok && isOlderThan(stored, registry.current)) {
        await writeBack([{ id, stored, doc: parsed.doc }]);
      }
      return parsed;
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

    save(doc: CharacterDocument, portrait?: string | null): Promise<void> {
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
        const picture = portrait === undefined ? undefined : validatedPortrait(portrait);

        const db = await openDb();
        try {
          // Autosave's path, and the most frequent write the app makes: one put, no portrait.
          if (picture === undefined) {
            await db.put(CHARACTER_STORE, validated, validated.id);
            return;
          }
          const tx = db.transaction([CHARACTER_STORE, PORTRAIT_STORE], 'readwrite');
          await tx.objectStore(CHARACTER_STORE).put(validated, validated.id);
          if (picture === null) await tx.objectStore(PORTRAIT_STORE).delete(validated.id);
          else await tx.objectStore(PORTRAIT_STORE).put(picture, validated.id);
          await tx.done;
        } finally {
          db.close();
        }
      });
    },

    getPortrait(id: string): Promise<string | null> {
      return guard(async () => {
        const db = await openDb();
        try {
          const stored = await db.get(PORTRAIT_STORE, id);
          return typeof stored === 'string' ? stored : null;
        } finally {
          db.close();
        }
      });
    },

    savePortrait(id: string, portrait: string | null): Promise<void> {
      return guard(async () => {
        const picture = validatedPortrait(portrait);
        const db = await openDb();
        try {
          if (picture === null) await db.delete(PORTRAIT_STORE, id);
          else await db.put(PORTRAIT_STORE, picture, id);
        } finally {
          db.close();
        }
      });
    },

    delete(id: string): Promise<void> {
      return guard(async () => {
        const db = await openDb();
        try {
          const tx = db.transaction([CHARACTER_STORE, PORTRAIT_STORE], 'readwrite');
          await tx.objectStore(CHARACTER_STORE).delete(id);
          await tx.objectStore(PORTRAIT_STORE).delete(id);
          await tx.done;
        } finally {
          db.close();
        }
      });
    },
  };
}
