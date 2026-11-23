// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LogEntry } from './entries.js';
import { Diagnostics, useDiagnostics, type RecorderModule } from './index.js';
import { createLogStore } from './logStore.js';

type FakeRecorder = { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> };

const entry = (t: number): LogEntry => ({
  kind: 'lifecycle',
  event: 'resume',
  at: new Date(Date.UTC(2026, 10, 22, 17, 0, 0) + t).toISOString(),
  t,
});

/**
 * A `Diagnostics` on its own database, with a recorder that does nothing but count: the real
 * one is the lazily loaded part, and these tests are about when it is built, started and stopped.
 */
let databases = 0;
const built: Diagnostics[] = [];
function setup() {
  const dbName = `diagnostics-index-test-${++databases}`;
  const made: FakeRecorder[] = [];
  const load = vi.fn((): Promise<RecorderModule> =>
    Promise.resolve({
      Recorder: class {
        start = vi.fn();
        flush = vi.fn(() => Promise.resolve());
        stop = vi.fn(() => Promise.resolve());
        constructor() {
          made.push(this);
        }
      },
    }),
  );
  const diagnostics = new Diagnostics({ dbName, load });
  built.push(diagnostics);
  return { diagnostics, load, made, store: createLogStore({ name: dbName }) };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  for (const diagnostics of built.splice(0)) diagnostics.dispose();
});

describe('startIfOn', () => {
  it('loads no recorder while the switch is off', async () => {
    const { diagnostics, load } = setup();
    diagnostics.startIfOn();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(load).not.toHaveBeenCalled();
  });

  it('starts the recorder at launch while the switch is on', async () => {
    localStorage.setItem('diagnostics:on', 'true');
    const { diagnostics, made } = setup();
    diagnostics.startIfOn();
    await vi.waitFor(() => expect(made).toHaveLength(1));
    expect(made[0]?.start).toHaveBeenCalledWith({ launch: true, initialHash: location.hash });
  });

  it('hands the recorder the hash the page opened on, read before the chunk loaded', async () => {
    localStorage.setItem('diagnostics:on', 'true');
    history.replaceState(null, '', '#/c/some-id/spells');
    try {
      const { diagnostics, made } = setup();
      diagnostics.startIfOn();
      history.replaceState(null, '', '#/');
      await vi.waitFor(() => expect(made).toHaveLength(1));
      expect(made[0]?.start).toHaveBeenCalledWith({
        launch: true,
        initialHash: '#/c/some-id/spells',
      });
    } finally {
      history.replaceState(null, '', '#');
    }
  });

  it('leaves the switch off when the recorder cannot be loaded', async () => {
    localStorage.setItem('diagnostics:on', 'true');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { diagnostics, load } = setup();
      load.mockRejectedValueOnce(new Error('offline'));
      const told = vi.fn();
      diagnostics.subscribe(told);
      expect(diagnostics.on).toBe(true);
      diagnostics.startIfOn();
      await vi.waitFor(() => expect(diagnostics.on).toBe(false));
      expect(told).toHaveBeenCalledOnce();
    } finally {
      warn.mockRestore();
    }
  });
});

describe("the switch is this tab's own state", () => {
  it('stays on, and can be switched off, when the browser refuses to store it', async () => {
    const { diagnostics, made } = setup();
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    try {
      const { result } = renderHook(() => useDiagnostics(diagnostics));
      await act(() => result.current.setOn(true));
      expect(result.current.view.on).toBe(true);
      await vi.waitFor(() => expect(made[0]?.start).toHaveBeenCalledOnce());

      await act(() => result.current.setOn(false));
      expect(result.current.view.on).toBe(false);
      expect(made[0]?.stop).toHaveBeenCalledOnce();
    } finally {
      set.mockRestore();
    }
  });
});

describe('another window changing the switch', () => {
  const change = (newValue: string | null) =>
    window.dispatchEvent(new StorageEvent('storage', { key: 'diagnostics:on', newValue }));

  it("stops this tab's recorder on false and starts it on true, and the hook follows", async () => {
    const { diagnostics, made } = setup();
    const { result } = renderHook(() => useDiagnostics(diagnostics));
    await act(() => result.current.setOn(true));
    await vi.waitFor(() => expect(made[0]?.start).toHaveBeenCalledOnce());

    await act(async () => change('false'));
    await vi.waitFor(() => expect(made[0]?.stop).toHaveBeenCalledOnce());
    expect(diagnostics.on).toBe(false);
    await vi.waitFor(() => expect(result.current.view.on).toBe(false));

    await act(async () => change('true'));
    await vi.waitFor(() => expect(made[0]?.start).toHaveBeenCalledTimes(2));
    expect(made[0]?.start).toHaveBeenLastCalledWith({ launch: false });
    await vi.waitFor(() => expect(result.current.view.on).toBe(true));
  });

  it('ignores other keys, and stops listening once disposed', async () => {
    const { diagnostics, load } = setup();
    window.dispatchEvent(new StorageEvent('storage', { key: 'theme', newValue: 'true' }));
    diagnostics.dispose();
    change('true');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(diagnostics.on).toBe(false);
    expect(load).not.toHaveBeenCalled();
  });
});

describe('useDiagnostics', () => {
  it('switching on stores the switch and starts the recorder; off stores it', async () => {
    const { diagnostics, load, made } = setup();
    const { result } = renderHook(() => useDiagnostics(diagnostics));
    await act(() => result.current.setOn(true));
    expect(localStorage.getItem('diagnostics:on')).toBe('true');
    expect(load).toHaveBeenCalledOnce();
    expect(result.current.view.on).toBe(true);

    await act(() => result.current.setOn(false));
    expect(localStorage.getItem('diagnostics:on')).toBe('false');
    expect(result.current.view.on).toBe(false);
    expect(made[0]?.stop).toHaveBeenCalledOnce();
  });

  it('starts from the menu as a switch-on', async () => {
    const { diagnostics, made } = setup();
    const { result } = renderHook(() => useDiagnostics(diagnostics));
    await act(() => result.current.setOn(true));
    expect(made[0]?.start).toHaveBeenCalledWith({ launch: false });
  });

  it('reuses the one recorder across off and on again', async () => {
    const { diagnostics, load, made } = setup();
    const { result } = renderHook(() => useDiagnostics(diagnostics));
    await act(() => result.current.setOn(true));
    await act(() => result.current.setOn(false));
    await act(() => result.current.setOn(true));
    await vi.waitFor(() => expect(made[0]?.start).toHaveBeenCalledTimes(2));
    expect(load).toHaveBeenCalledOnce();
    expect(made).toHaveLength(1);
  });

  it('does not start a recorder the player switched off while its chunk was loading', async () => {
    const { diagnostics, made } = setup();
    const { result } = renderHook(() => useDiagnostics(diagnostics));
    await act(async () => {
      const on = result.current.setOn(true);
      await result.current.setOn(false);
      await on;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(made).toHaveLength(1);
    expect(made.every((recorder) => recorder.start.mock.calls.length === 0)).toBe(true);
  });

  it('tries the load again after one failed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { diagnostics, load, made } = setup();
      load.mockRejectedValueOnce(new Error('offline'));
      const { result } = renderHook(() => useDiagnostics(diagnostics));
      await act(() => result.current.setOn(true));
      await act(() => result.current.setOn(false));
      await act(() => result.current.setOn(true));
      await vi.waitFor(() => expect(made[0]?.start).toHaveBeenCalledOnce());
      expect(load).toHaveBeenCalledTimes(2);
    } finally {
      warn.mockRestore();
    }
  });

  it('refresh counts the log and dates it from its oldest entry', async () => {
    const { diagnostics, store } = setup();
    await store.append([entry(1000), entry(2000)]);
    const { result } = renderHook(() => useDiagnostics(diagnostics));
    await act(() => result.current.refresh());
    expect(result.current.view).toEqual({
      on: false,
      count: 2,
      since: '2026-11-22T17:00:01.000Z',
    });
  });

  it('keeps the same view object when a refresh finds nothing new', async () => {
    const { diagnostics, store } = setup();
    await store.append([entry(1000)]);
    const { result } = renderHook(() => useDiagnostics(diagnostics));
    await act(() => result.current.refresh());
    const before = result.current.view;
    await act(() => result.current.refresh());
    expect(result.current.view).toBe(before);
  });

  it('exports the log as a dated file, oldest first', async () => {
    const { diagnostics, store } = setup();
    await store.append([entry(1000), entry(2000)]);
    const { result } = renderHook(() => useDiagnostics(diagnostics));
    const file = await result.current.logFile(new Date('2026-11-22T18:03:11.402Z'));
    expect(file?.filename).toBe('dnd-diagnostics-2026-11-22.json');
    expect(JSON.parse(file?.text ?? 'null')).toEqual({
      format: 1,
      exportedAt: '2026-11-22T18:03:11.402Z',
      entries: [entry(1000), entry(2000)],
    });
  });

  it('clear empties the log, and says it did', async () => {
    const { diagnostics, store } = setup();
    await store.append([entry(1000)]);
    const { result } = renderHook(() => useDiagnostics(diagnostics));
    expect(await act(() => result.current.clear())).toBe(true);
    expect(result.current.view.count).toBe(0);
    expect(await store.count()).toBe(0);
  });
});
