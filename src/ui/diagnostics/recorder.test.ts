// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FrameEntry, LogEntry, RouteEntry } from './entries.js';
import { Recorder, type ObserverConstructor, type RecorderOptions } from './recorder.js';

const ORIGIN = Date.UTC(2026, 10, 22, 17, 0, 0);
const ID = 'e4c315d2-310f-454b-82c5-ad649abaa300';

/** jsdom has a `PerformanceObserver`, but neither entry type, so the test drives its own. */
class FakeObserver {
  static supportedEntryTypes: readonly string[] = ['long-animation-frame', 'event'];
  static all: FakeObserver[] = [];
  options: Record<string, unknown> | null = null;
  disconnected = false;

  constructor(readonly callback: (list: { getEntries(): PerformanceEntry[] }) => void) {
    FakeObserver.all.push(this);
  }
  observe(options: Record<string, unknown>): void {
    this.options = options;
  }
  disconnect(): void {
    this.disconnected = true;
  }
  emit(entries: object[]): void {
    this.callback({ getEntries: () => entries as PerformanceEntry[] });
  }
  static of(type: string): FakeObserver {
    const found = FakeObserver.all.find((observer) => observer.options?.type === type);
    if (found === undefined) throw new Error(`nothing observes ${type}`);
    return found;
  }
}

const loaf = (startTime = 100) => ({
  startTime,
  duration: 120,
  renderStart: startTime + 100,
  styleAndLayoutStart: startTime + 105,
  blockingDuration: 70,
  scripts: [],
});

/** Enough turns of the microtask queue for a flush to reach the store. */
const settle = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

const isFrame = (entry: LogEntry): entry is FrameEntry => entry.kind === 'frame';
const isRoute = (entry: LogEntry): entry is RouteEntry => entry.kind === 'route';

let written: LogEntry[];
let append: ReturnType<typeof vi.fn<(entries: readonly LogEntry[]) => Promise<void>>>;
let created: Recorder[];

function recorder(overrides: Partial<RecorderOptions> = {}): Recorder {
  const made = new Recorder({
    store: { append },
    Observer: FakeObserver as unknown as ObserverConstructor,
    now: () => Date.now(),
    wallNow: () => ORIGIN + Date.now(),
    frame: (callback) => void setTimeout(callback, 16),
    heap: () => 1_000_000,
    ...overrides,
  });
  created.push(made);
  return made;
}

beforeEach(() => {
  vi.useFakeTimers({
    now: 0,
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
  });
  history.replaceState(null, '', `#/c/${ID}/spells`);
  FakeObserver.all = [];
  written = [];
  append = vi.fn((entries: readonly LogEntry[]) => {
    written.push(...entries);
    return Promise.resolve();
  });
  created = [];
});

afterEach(async () => {
  for (const made of created) await made.stop();
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  vi.useRealTimers();
});

describe('Recorder', () => {
  it('writes a session entry, then a batch every 2 s', async () => {
    recorder().start({ launch: true });
    expect(append).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    expect(written.map((entry) => entry.kind)).toEqual(['session']);

    FakeObserver.of('long-animation-frame').emit([loaf()]);
    await vi.advanceTimersByTimeAsync(1999);
    expect(append).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(written.map((entry) => entry.kind)).toEqual(['session', 'frame']);
  });

  it('reads the heap once for a batch of frames', () => {
    const heap = vi.fn(() => 1_000_000);
    recorder({ heap }).start({ launch: true });
    FakeObserver.of('long-animation-frame').emit([loaf(100), loaf(200), loaf(300)]);
    expect(heap).toHaveBeenCalledOnce();
  });

  it('keeps no timer pending once the buffer is written and nothing new arrives', async () => {
    recorder().start({ launch: true });
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(written).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(append).toHaveBeenCalledTimes(1);
  });

  it('observes both entry types buffered, and taps from 100 ms', () => {
    recorder().start({ launch: true });
    expect(FakeObserver.of('long-animation-frame').options).toEqual({
      type: 'long-animation-frame',
      buffered: true,
    });
    expect(FakeObserver.of('event').options).toEqual({
      type: 'event',
      buffered: true,
      durationThreshold: 100,
    });
  });

  it('observes nothing the browser does not support, and says so', async () => {
    class Unsupported extends FakeObserver {
      static override supportedEntryTypes: readonly string[] = [];
    }
    const made = recorder({ Observer: Unsupported as unknown as ObserverConstructor });
    made.start({ launch: true });
    await made.flush();
    expect(FakeObserver.all).toEqual([]);
    expect(written[0]).toMatchObject({
      kind: 'session',
      supports: { frames: false, inputs: false },
    });
  });

  it('labels a frame with the screen it started on', async () => {
    const made = recorder();
    made.start({ launch: true });
    await vi.advanceTimersByTimeAsync(500);
    history.replaceState(null, '', `#/c/${ID}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    FakeObserver.of('long-animation-frame').emit([loaf(100), loaf(600)]);
    await made.flush();
    expect(written.filter(isFrame).map((entry) => entry.route)).toEqual([
      { name: 'character', section: 'spells' },
      { name: 'character', section: null },
    ]);
  });

  it("labels a frame from before a switch-on start with no screen, and a launch start with the page's", async () => {
    await vi.advanceTimersByTimeAsync(500);
    const switched = recorder();
    switched.start({ launch: false });
    FakeObserver.of('long-animation-frame').emit([loaf(100), loaf(600)]);
    await switched.flush();
    expect(written.filter(isFrame).map((entry) => entry.route)).toEqual([
      null,
      { name: 'character', section: 'spells' },
    ]);

    written.length = 0;
    FakeObserver.all = [];
    const launched = recorder();
    launched.start({ launch: true });
    FakeObserver.of('long-animation-frame').emit([loaf(100)]);
    await launched.flush();
    expect(written.filter(isFrame).map((entry) => entry.route)).toEqual([
      { name: 'character', section: 'spells' },
    ]);
  });

  it('skips a frame from before the last stop, keeps one from while off with no route, and labels one after the restart', async () => {
    const made = recorder();
    made.start({ launch: true });
    await vi.advanceTimersByTimeAsync(1000);
    await made.stop();
    written.length = 0;
    FakeObserver.all = [];

    await vi.advanceTimersByTimeAsync(1000);
    made.start({ launch: false });
    const tap = (startTime: number, interactionId: number) => ({
      name: 'click',
      startTime,
      duration: 200,
      processingStart: startTime + 10,
      processingEnd: startTime + 60,
      interactionId,
      target: null,
    });
    FakeObserver.of('long-animation-frame').emit([loaf(900), loaf(1500), loaf(2500)]);
    FakeObserver.of('event').emit([tap(900, 1), tap(1500, 2), tap(2500, 3)]);
    await made.flush();
    const frames = written.filter(isFrame);
    expect(frames.map((entry) => entry.t)).toEqual([1500, 2500]);
    expect(frames.map((entry) => entry.route)).toEqual([
      null,
      { name: 'character', section: 'spells' },
    ]);
    expect(written.filter((entry) => entry.kind === 'input').map((entry) => entry.t)).toEqual([
      1500, 2500,
    ]);
  });

  it('times a screen change to the frame after it, and records no id', async () => {
    const made = recorder();
    made.start({ launch: true });
    await vi.advanceTimersByTimeAsync(1000);
    history.replaceState(null, '', `#/c/${ID}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    // The fake clock runs a 0 ms timer 1 ms on, so the frame at 16 is done at 17.
    await vi.advanceTimersByTimeAsync(17);
    await made.flush();
    expect(written.find(isRoute)).toEqual({
      kind: 'route',
      at: new Date(ORIGIN + 1000).toISOString(),
      t: 1000,
      from: { name: 'character', section: 'spells' },
      to: { name: 'character', section: null },
      toNextFrame: 16,
      toFrameDone: 17,
    });
    expect(JSON.stringify(written)).not.toContain(ID);
  });

  it('dates an entry from the wall clock when the performance clock has fallen behind', async () => {
    const SLEPT = 8 * 3_600_000;
    const made = recorder({ now: () => 1000, wallNow: () => ORIGIN + SLEPT + 1000 });
    made.start({ launch: true });
    FakeObserver.of('long-animation-frame').emit([loaf(1000)]);
    await made.flush();
    expect(written.find(isFrame)).toMatchObject({
      t: 1000,
      at: new Date(ORIGIN + SLEPT + 1000).toISOString(),
    });
  });

  it('stamps a screen change when it happens, not when its frame comes', async () => {
    let wall = ORIGIN;
    const made = recorder({ wallNow: () => wall + Date.now() });
    made.start({ launch: true });
    await vi.advanceTimersByTimeAsync(1000);
    history.replaceState(null, '', `#/c/${ID}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    wall += 8 * 3_600_000; // the device sleeps before the frame
    await vi.advanceTimersByTimeAsync(17);
    await made.flush();
    expect(written.find(isRoute)?.at).toBe(new Date(ORIGIN + 1000).toISOString());
  });

  it('writes at once when the app is hidden, and on pagehide', async () => {
    recorder().start({ launch: true });
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect(written.map((entry) => entry.kind)).toEqual(['session', 'lifecycle']);
    expect(written[1]).toMatchObject({ event: 'visibilitychange', state: 'hidden' });

    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    await settle();
    expect(written.at(-1)).toMatchObject({ kind: 'lifecycle', event: 'pagehide', persisted: true });
  });

  it('stop disconnects, stops listening, and writes what is left', async () => {
    const made = recorder();
    made.start({ launch: true });
    FakeObserver.of('long-animation-frame').emit([loaf()]);
    await made.stop();
    expect(made.recording).toBe(false);
    // The 2 s interval is cleared, not only ignored.
    expect(vi.getTimerCount()).toBe(0);
    expect(FakeObserver.all.every((observer) => observer.disconnected)).toBe(true);
    expect(written.map((entry) => entry.kind)).toEqual(['session', 'frame']);

    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await vi.advanceTimersByTimeAsync(5000);
    expect(written).toHaveLength(2);

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect(written).toHaveLength(2);
  });

  it.each([
    ['pageshow', window, () => new PageTransitionEvent('pageshow', { persisted: true }), true],
    ['freeze', document, () => new Event('freeze'), undefined],
    ['resume', document, () => new Event('resume'), undefined],
  ] as const)('writes a lifecycle entry for %s', async (event, target, make, persisted) => {
    const made = recorder();
    made.start({ launch: true });
    target.dispatchEvent(make());
    await made.flush();
    const entry = written.find((e) => e.kind === 'lifecycle');
    expect(entry).toMatchObject({ kind: 'lifecycle', event });
    expect(entry !== undefined && 'persisted' in entry ? entry.persisted : undefined).toBe(
      persisted,
    );
  });

  it('writes a lifecycle entry when the service worker controller changes', async () => {
    const worker = new EventTarget();
    Object.defineProperty(navigator, 'serviceWorker', { value: worker, configurable: true });
    try {
      const made = recorder();
      made.start({ launch: true });
      worker.dispatchEvent(new Event('controllerchange'));
      await made.flush();
      expect(written.at(-1)).toMatchObject({ kind: 'lifecycle', event: 'controllerchange' });
    } finally {
      delete (navigator as unknown as Record<string, unknown>).serviceWorker;
    }
  });

  it('records no screen change timed after stop', async () => {
    const made = recorder();
    made.start({ launch: true });
    history.replaceState(null, '', `#/c/${ID}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await made.stop();
    await vi.advanceTimersByTimeAsync(17);
    await made.flush();
    expect(written.filter(isRoute)).toEqual([]);
  });

  it('never throws when the store refuses a batch', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    append.mockImplementation(() => Promise.reject(new Error('QuotaExceededError')));
    const made = recorder();
    made.start({ launch: true });
    await expect(made.flush()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
