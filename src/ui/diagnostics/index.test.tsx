// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LogEntry } from './entries.js';

/** The recorder is the one part loaded lazily: these tests count how often it is built. */
const { built, made } = vi.hoisted(() => ({
  built: vi.fn(),
  made: [] as { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }[],
}));
vi.mock('./recorder.js', () => ({
  Recorder: class {
    start = vi.fn();
    flush = vi.fn(() => Promise.resolve());
    stop = vi.fn(() => Promise.resolve());
    constructor(options: unknown) {
      built(options);
      made.push(this);
    }
  },
}));

const entry = (t: number): LogEntry => ({
  kind: 'lifecycle',
  event: 'resume',
  at: new Date(Date.UTC(2026, 10, 22, 17, 0, 0) + t).toISOString(),
  t,
});

/** A fresh copy of the module each test, so its record of a running recorder starts empty. */
const load = () => import('./index.js');
const store = async () => (await import('./logStore.js')).createLogStore();

beforeEach(async () => {
  localStorage.clear();
  built.mockClear();
  made.length = 0;
  vi.resetModules();
  await (await store()).clear();
});

describe('startIfOn', () => {
  it('loads no recorder while the switch is off', async () => {
    (await load()).startIfOn();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(built).not.toHaveBeenCalled();
  });

  it('starts the recorder at launch while the switch is on', async () => {
    localStorage.setItem('diagnostics:on', 'true');
    (await load()).startIfOn();
    await vi.waitFor(() => expect(built).toHaveBeenCalledOnce());
  });
});

describe('useDiagnostics', () => {
  it('switching on stores the switch and starts the recorder; off stores it', async () => {
    const { useDiagnostics } = await load();
    const { result } = renderHook(() => useDiagnostics());
    await act(() => result.current.setOn(true));
    expect(localStorage.getItem('diagnostics:on')).toBe('true');
    expect(built).toHaveBeenCalledOnce();
    expect(result.current.view.on).toBe(true);

    await act(() => result.current.setOn(false));
    expect(localStorage.getItem('diagnostics:on')).toBe('false');
    expect(result.current.view.on).toBe(false);
    expect(made[0]?.stop).toHaveBeenCalledOnce();
  });

  it('starts from the menu as a switch-on, and at launch as a launch', async () => {
    const { useDiagnostics } = await load();
    const { result } = renderHook(() => useDiagnostics());
    await act(() => result.current.setOn(true));
    expect(made[0]?.start).toHaveBeenCalledWith({ launch: false });

    vi.resetModules();
    localStorage.setItem('diagnostics:on', 'true');
    (await load()).startIfOn();
    await vi.waitFor(() => expect(made).toHaveLength(2));
    expect(made[1]?.start).toHaveBeenCalledWith({ launch: true });
  });

  it('does not start a recorder the player switched off while its chunk was loading', async () => {
    const { useDiagnostics } = await load();
    const { result } = renderHook(() => useDiagnostics());
    await act(async () => {
      const on = result.current.setOn(true);
      await result.current.setOn(false);
      await on;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(made.every((recorder) => recorder.start.mock.calls.length === 0)).toBe(true);
  });

  it('refresh counts the log and dates it from its oldest entry', async () => {
    await (await store()).append([entry(1000), entry(2000)]);
    const { useDiagnostics } = await load();
    const { result } = renderHook(() => useDiagnostics());
    await act(() => result.current.refresh());
    expect(result.current.view).toEqual({
      on: false,
      count: 2,
      since: '2026-11-22T17:00:01.000Z',
    });
  });

  it('exports the log as a dated file, oldest first', async () => {
    await (await store()).append([entry(1000), entry(2000)]);
    const { useDiagnostics } = await load();
    const { result } = renderHook(() => useDiagnostics());
    const file = await result.current.logFile(new Date('2026-11-22T18:03:11.402Z'));
    expect(file?.filename).toBe('dnd-diagnostics-2026-11-22.json');
    expect(JSON.parse(file?.text ?? 'null')).toEqual({
      format: 1,
      exportedAt: '2026-11-22T18:03:11.402Z',
      entries: [entry(1000), entry(2000)],
    });
  });

  it('clear empties the log', async () => {
    await (await store()).append([entry(1000)]);
    const { useDiagnostics } = await load();
    const { result } = renderHook(() => useDiagnostics());
    await act(() => result.current.clear());
    expect(result.current.view.count).toBe(0);
    expect(await (await store()).count()).toBe(0);
  });
});
