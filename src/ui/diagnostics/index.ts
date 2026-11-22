import { useCallback, useState } from 'react';
import { readPersisted, writePersisted } from '../persistedState.js';
import type { DiagnosticsView } from '../types.js';
import { createLogStore } from './logStore.js';

/**
 * The diagnostics log's only way in (spec 2026-11-22 §3): the switch, the log, and the recorder
 * behind them. `main.tsx` calls `startIfOn()`; `App` uses `useDiagnostics()`. Nothing else in
 * the app imports this folder.
 *
 * The recorder is loaded with a dynamic `import()`, and only while the switch is on, so a
 * player who never turns diagnostics on never loads it.
 */
const KEY = 'diagnostics:on';
const store = createLogStore();

interface Running {
  flush(): Promise<void>;
  stop(): Promise<void>;
}
let running: Promise<Running> | null = null;

export function isRecording(): boolean {
  return readPersisted(KEY, false);
}

/** Called once by `main.tsx`, before the first render, so a launch is recorded from its start. */
export function startIfOn(): void {
  if (isRecording()) start();
}

function start(): void {
  if (running !== null) return;
  const loading = import('./recorder.js').then(({ Recorder }) => {
    const recorder = new Recorder({ store });
    recorder.start();
    return recorder;
  });
  running = loading;
  // A chunk that failed to load is forgotten, so switching on again retries it.
  loading.catch((error: unknown) => {
    if (running === loading) running = null;
    console.warn('Diagnostics: the recorder could not be loaded.', error);
  });
}

async function stop(): Promise<void> {
  const current = running;
  running = null;
  if (current !== null) await (await current).stop();
}

async function flush(): Promise<void> {
  if (running !== null) await (await running).flush();
}

export function useDiagnostics(): {
  view: DiagnosticsView;
  /** Re-reads the count and the oldest entry, after writing what the recorder holds. */
  refresh(): Promise<void>;
  setOn(on: boolean): Promise<void>;
  /** The log as a file, or null when it could not be read. */
  logFile(now?: Date): Promise<{ filename: string; text: string } | null>;
  clear(): Promise<void>;
} {
  const [view, setView] = useState<DiagnosticsView>(() => ({
    on: isRecording(),
    count: 0,
    since: null,
  }));

  const refresh = useCallback(async () => {
    try {
      await flush();
      const [count, oldest] = await Promise.all([store.count(), store.oldest()]);
      setView({ on: isRecording(), count, since: oldest?.at ?? null });
    } catch (error) {
      console.warn('Diagnostics: the log could not be read.', error);
      setView((previous) => ({ ...previous, on: isRecording() }));
    }
  }, []);

  const setOn = useCallback(
    async (on: boolean) => {
      writePersisted(KEY, on);
      setView((previous) => ({ ...previous, on }));
      try {
        if (on) start();
        else await stop();
      } catch (error) {
        console.warn('Diagnostics: the recorder could not be stopped cleanly.', error);
      }
      await refresh();
    },
    [refresh],
  );

  const logFile = useCallback(async (now: Date = new Date()) => {
    try {
      await flush();
      const entries = await store.readAll();
      return {
        filename: `dnd-diagnostics-${now.toISOString().slice(0, 10)}.json`,
        text: JSON.stringify({ format: 1, exportedAt: now.toISOString(), entries }),
      };
    } catch (error) {
      console.warn('Diagnostics: the log could not be read.', error);
      return null;
    }
  }, []);

  const clear = useCallback(async () => {
    try {
      await flush();
      await store.clear();
    } catch (error) {
      console.warn('Diagnostics: the log could not be cleared.', error);
    }
    await refresh();
  }, [refresh]);

  return { view, refresh, setOn, logFile, clear };
}
