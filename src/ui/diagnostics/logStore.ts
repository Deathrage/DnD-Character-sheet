import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { LogEntry } from './entries.js';

/**
 * The diagnostics log's own IndexedDB database (spec 2026-11-22 §4).
 *
 * Not a store in the characters database: adding one there means bumping its `DB_VERSION`,
 * which waits on every other open tab and locks older builds out, and a debugging tool must
 * never risk that. Keys are generated (`autoIncrement`, no `keyPath`), so a key is never read
 * from a stored value, for the same reason the characters store never does.
 *
 * Only a write creates it: every read and `clear` first asks whether it exists, and answers
 * empty if not, so a player who never turns Diagnostics on never gets the database.
 */
export const DB_NAME = 'dnd-diagnostics';
export const MAX_ENTRIES = 2000;

interface DiagnosticsDb extends DBSchema {
  entries: { key: number; value: LogEntry };
}

export interface LogStore {
  /** Appends in one transaction, then deletes the oldest past the cap in the same one. */
  append(entries: readonly LogEntry[]): Promise<void>;
  /** Oldest first. */
  readAll(): Promise<LogEntry[]>;
  count(): Promise<number>;
  oldest(): Promise<LogEntry | null>;
  clear(): Promise<void>;
}

export function createLogStore({
  name = DB_NAME,
  cap = MAX_ENTRIES,
}: { name?: string; cap?: number } = {}): LogStore {
  let opening: Promise<IDBPDatabase<DiagnosticsDb>> | null = null;

  /** Opened on first write; a read of a database that does not exist never gets here. */
  const db = (): Promise<IDBPDatabase<DiagnosticsDb>> =>
    (opening ??= openDB<DiagnosticsDb>(name, 1, {
      upgrade(database) {
        database.createObjectStore('entries', { autoIncrement: true });
      },
      // The browser closed the connection (storage cleared, for one): the next call reopens.
      terminated() {
        opening = null;
      },
    }).catch((error: unknown) => {
      opening = null;
      throw error;
    }));

  /**
   * Whether the database exists, without creating it. Where `indexedDB.databases` is missing
   * (old Firefox) this says yes, and the read opens it as it always did.
   */
  const exists = async (): Promise<boolean> => {
    if (opening !== null) return true;
    if (typeof indexedDB.databases !== 'function') return true;
    return (await indexedDB.databases()).some((info) => info.name === name);
  };

  return {
    async append(entries) {
      if (entries.length === 0) return;
      const tx = (await db()).transaction('entries', 'readwrite');
      const done = tx.done;
      // Awaited below. This only keeps a write that throws first from leaving it unhandled.
      done.catch(() => {});
      await Promise.all(entries.map((entry) => tx.store.add(entry)));
      const excess = (await tx.store.count()) - cap;
      if (excess > 0) {
        const keys = await tx.store.getAllKeys(null, excess);
        const newestDropped = keys.at(-1);
        if (newestDropped !== undefined) {
          await tx.store.delete(IDBKeyRange.upperBound(newestDropped));
        }
      }
      await done;
    },
    async readAll() {
      return (await exists()) ? (await db()).getAll('entries') : [];
    },
    async count() {
      return (await exists()) ? (await db()).count('entries') : 0;
    },
    async oldest() {
      if (!(await exists())) return null;
      const cursor = await (await db()).transaction('entries').store.openCursor();
      return cursor?.value ?? null;
    },
    async clear() {
      if (!(await exists())) return;
      await (await db()).clear('entries');
    },
  };
}
