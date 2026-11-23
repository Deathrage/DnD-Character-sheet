import { useCallback, useState } from 'react';
import { readPersisted, writePersisted } from '../persistedState.js';
import type { DiagnosticsView } from '../types.js';
import { createLogStore, type LogStore } from './logStore.js';

/**
 * The diagnostics log's only way in (spec 2026-11-22 §3): the switch, the log, and the recorder
 * behind them. `main.tsx` builds one `Diagnostics`, calls `startIfOn()` and passes it to `App`,
 * which reads it through `useDiagnostics()`, as it does `library` and `cloud`. Nothing else in
 * the app imports this folder.
 *
 * The recorder is loaded with a dynamic `import()`, and only while the switch is on, so a
 * player who never turns diagnostics on never loads it.
 */
const KEY = 'diagnostics:on';

/** The slice of `Recorder` used here. */
interface RecorderLike {
  start(options: { launch: boolean }): void;
  flush(): Promise<void>;
  stop(): Promise<void>;
}

/** What `import('./recorder.js')` gives: injectable, so tests need no module mocking. */
export interface RecorderModule {
  Recorder: new (options: { store: LogStore }) => RecorderLike;
}

export interface DiagnosticsOptions {
  /** The log's database. Defaults to the app's; tests give each case its own. */
  dbName?: string;
  load?: () => Promise<RecorderModule>;
}

export class Diagnostics {
  readonly #store: LogStore;
  readonly #load: () => Promise<RecorderModule>;
  /** Loaded once and reused across off → on. Null before the first switch-on, and after a failure. */
  #recorder: Promise<RecorderLike> | null = null;
  /** Whether the player wants recording now: a recorder whose load finishes late checks it. */
  #wanted = false;

  constructor({ dbName, load = () => import('./recorder.js') }: DiagnosticsOptions = {}) {
    this.#store = createLogStore(dbName === undefined ? {} : { name: dbName });
    this.#load = load;
  }

  /** The persisted switch. */
  get on(): boolean {
    return readPersisted(KEY, false);
  }

  /** Called once by `main.tsx`, before the first render, so a launch is recorded from its start. */
  startIfOn(): void {
    if (this.on) this.#start(true);
  }

  async setOn(on: boolean): Promise<void> {
    writePersisted(KEY, on);
    if (on) this.#start(false);
    else await this.#stop();
  }

  /** The count and the oldest entry's time, after writing what the recorder holds. */
  async summary(): Promise<{ count: number; since: string | null }> {
    await this.#flush();
    const [count, oldest] = await Promise.all([this.#store.count(), this.#store.oldest()]);
    return { count, since: oldest?.at ?? null };
  }

  /** The log as a file, or null when it could not be read. */
  async logFile(now: Date = new Date()): Promise<{ filename: string; text: string } | null> {
    try {
      await this.#flush();
      const entries = await this.#store.readAll();
      return {
        filename: `dnd-diagnostics-${now.toISOString().slice(0, 10)}.json`,
        text: JSON.stringify({ format: 1, exportedAt: now.toISOString(), entries }),
      };
    } catch (error) {
      console.warn('Diagnostics: the log could not be read.', error);
      return null;
    }
  }

  async clear(): Promise<void> {
    try {
      await this.#flush();
      await this.#store.clear();
    } catch (error) {
      console.warn('Diagnostics: the log could not be cleared.', error);
    }
  }

  #loadRecorder(): Promise<RecorderLike> {
    if (this.#recorder === null) {
      const loading = this.#load().then(({ Recorder }) => new Recorder({ store: this.#store }));
      this.#recorder = loading;
      // A chunk that failed to load is forgotten, so switching on again retries it.
      loading.catch((error: unknown) => {
        if (this.#recorder === loading) this.#recorder = null;
        console.warn('Diagnostics: the recorder could not be loaded.', error);
      });
    }
    return this.#recorder;
  }

  /** `launch` is whether recording starts with the page, rather than from the menu mid-launch. */
  #start(launch: boolean): void {
    this.#wanted = true;
    this.#loadRecorder().then(
      (recorder) => {
        // Switched off while the chunk was loading: a recorder started now would record after
        // the player said off. `start` is idempotent, so a quick off → on starts it once.
        if (this.#wanted) recorder.start({ launch });
      },
      () => {}, // Already reported by `#loadRecorder`.
    );
  }

  async #stop(): Promise<void> {
    this.#wanted = false;
    if (this.#recorder !== null) await (await this.#recorder).stop();
  }

  async #flush(): Promise<void> {
    const recorder = this.#recorder;
    if (recorder === null) return;
    let loaded: RecorderLike;
    try {
      loaded = await recorder;
    } catch {
      return; // Never loaded, so nothing is held to write.
    }
    await loaded.flush();
  }
}

export interface DiagnosticsHook {
  view: DiagnosticsView;
  /** Re-reads the count and the oldest entry, after writing what the recorder holds. */
  refresh(): Promise<void>;
  setOn(on: boolean): Promise<void>;
  /** The log as a file, or null when it could not be read. */
  logFile(now?: Date): Promise<{ filename: string; text: string } | null>;
  clear(): Promise<void>;
}

export function useDiagnostics(diagnostics: Diagnostics): DiagnosticsHook {
  const [view, setView] = useState<DiagnosticsView>(() => ({
    on: diagnostics.on,
    count: 0,
    since: null,
  }));

  const refresh = useCallback(async () => {
    try {
      const { count, since } = await diagnostics.summary();
      const on = diagnostics.on;
      // The same object when nothing changed, so a refresh that found nothing new renders nothing.
      setView((previous) =>
        previous.on === on && previous.count === count && previous.since === since
          ? previous
          : { on, count, since },
      );
    } catch (error) {
      console.warn('Diagnostics: the log could not be read.', error);
      const on = diagnostics.on;
      setView((previous) => (previous.on === on ? previous : { ...previous, on }));
    }
  }, [diagnostics]);

  const setOn = useCallback(
    async (on: boolean) => {
      setView((previous) => (previous.on === on ? previous : { ...previous, on }));
      try {
        await diagnostics.setOn(on);
      } catch (error) {
        console.warn('Diagnostics: the recorder could not be stopped cleanly.', error);
      }
      await refresh();
    },
    [diagnostics, refresh],
  );

  const logFile = useCallback((now?: Date) => diagnostics.logFile(now), [diagnostics]);

  const clear = useCallback(async () => {
    await diagnostics.clear();
    await refresh();
  }, [diagnostics, refresh]);

  return { view, refresh, setOn, logFile, clear };
}
