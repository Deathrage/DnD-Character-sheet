import {
  frameEntry,
  inputEntries,
  round,
  routeAt,
  routeOfHash,
  stamp,
  type EventTiming,
  type LifecycleEntry,
  type LogEntry,
  type LongAnimationFrameTiming,
  type RouteMark,
  type SessionEntry,
} from './entries.js';
import type { LogStore } from './logStore.js';

/**
 * Records while diagnostics is on (spec 2026-11-22 §2–§4): two `PerformanceObserver`s, the
 * page's lifecycle events, and a buffer written to the log every 2 s and at once when the app
 * is hidden, because Android may kill a hidden app with no further event.
 *
 * Loaded only by `index.ts`, with a dynamic `import()`, and only while the switch is on.
 */

/** The slice of `PerformanceObserver` used here. */
export interface ObserverConstructor {
  new (callback: (list: { getEntries(): PerformanceEntry[] }) => void): {
    observe(options: Record<string, unknown>): void;
    disconnect(): void;
  };
  readonly supportedEntryTypes?: readonly string[];
}

export interface RecorderOptions {
  store: Pick<LogStore, 'append'>;
  /** Defaults to the browser's. Injectable: jsdom has one, but neither entry type. */
  Observer?: ObserverConstructor | undefined;
  /** Defaults to `performance.now`. */
  now?: () => number;
  /** Defaults to `performance.timeOrigin`. */
  timeOrigin?: number;
  /** Runs a callback at the next frame. Defaults to `requestAnimationFrame`. */
  frame?: (callback: () => void) => void;
  /** Defaults to Chrome's `performance.memory.usedJSHeapSize`, null elsewhere. */
  heap?: () => number | null;
  flushMs?: number;
}

const FLUSH_MS = 2000;
const INPUT_THRESHOLD_MS = 100;
/** Interaction ids remembered so an interaction split across batches is recorded once. */
const MAX_SEEN = 200;
const MAX_ROUTES = 50;

export class Recorder {
  readonly #store: Pick<LogStore, 'append'>;
  readonly #Observer: ObserverConstructor | undefined;
  readonly #now: () => number;
  readonly #timeOrigin: number;
  readonly #frame: (callback: () => void) => void;
  readonly #heap: () => number | null;
  readonly #flushMs: number;

  #buffer: LogEntry[] = [];
  #routes: RouteMark[] = [];
  readonly #seen = new Set<number>();
  #stops: (() => void)[] = [];
  /** Chained, so batches land in order and a flush during a write waits for it. */
  #writing: Promise<void> = Promise.resolve();

  constructor(options: RecorderOptions) {
    this.#store = options.store;
    this.#Observer =
      'Observer' in options
        ? options.Observer
        : (globalThis.PerformanceObserver as unknown as ObserverConstructor | undefined);
    this.#now = options.now ?? (() => performance.now());
    this.#timeOrigin = options.timeOrigin ?? performance.timeOrigin;
    this.#frame = options.frame ?? ((callback) => void requestAnimationFrame(() => callback()));
    this.#heap = options.heap ?? readHeap;
    this.#flushMs = options.flushMs ?? FLUSH_MS;
  }

  get recording(): boolean {
    return this.#stops.length > 0;
  }

  start(): void {
    if (this.recording) return;
    this.#routes = [{ t: 0, route: routeOfHash(location.hash) }];
    this.#push(this.#session());

    this.#observe('long-animation-frame', {}, (entries) => {
      for (const entry of entries as unknown as LongAnimationFrameTiming[]) {
        this.#push(
          frameEntry(entry, {
            timeOrigin: this.#timeOrigin,
            route: routeAt(this.#routes, entry.startTime),
            heap: this.#heap(),
          }),
        );
      }
    });
    this.#observe('event', { durationThreshold: INPUT_THRESHOLD_MS }, (entries) => {
      if (this.#seen.size > MAX_SEEN) this.#seen.clear();
      this.#push(
        ...inputEntries(entries as unknown as EventTiming[], {
          timeOrigin: this.#timeOrigin,
          routeAt: (t) => routeAt(this.#routes, t),
          seen: this.#seen,
        }),
      );
    });

    this.#listen(globalThis, 'hashchange', this.#onHashChange);
    this.#listen(document, 'visibilitychange', () => {
      this.#lifecycle({ event: 'visibilitychange', state: document.visibilityState });
      if (document.visibilityState === 'hidden') void this.flush();
    });
    this.#listen(globalThis, 'pagehide', (event) => {
      this.#lifecycle({ event: 'pagehide', persisted: persisted(event) });
      void this.flush();
    });
    this.#listen(globalThis, 'pageshow', (event) =>
      this.#lifecycle({ event: 'pageshow', persisted: persisted(event) }),
    );
    this.#listen(document, 'freeze', () => this.#lifecycle({ event: 'freeze' }));
    this.#listen(document, 'resume', () => this.#lifecycle({ event: 'resume' }));
    if ('serviceWorker' in navigator) {
      this.#listen(navigator.serviceWorker, 'controllerchange', () =>
        this.#lifecycle({ event: 'controllerchange' }),
      );
    }

    const timer = setInterval(() => void this.flush(), this.#flushMs);
    this.#stops.push(() => clearInterval(timer));
  }

  /** Disconnects everything, then writes what the buffer still holds. The log is kept. */
  async stop(): Promise<void> {
    for (const stop of this.#stops.splice(0)) stop();
    await this.flush();
  }

  /** Writes the buffer. Never rejects: a failed batch is dropped with a warning. */
  flush(): Promise<void> {
    this.#writing = this.#writing.then(async () => {
      const batch = this.#buffer.splice(0);
      if (batch.length === 0) return;
      try {
        await this.#store.append(batch);
      } catch (error) {
        console.warn(`Diagnostics: ${batch.length} log entries could not be written.`, error);
      }
    });
    return this.#writing;
  }

  #push(...entries: LogEntry[]): void {
    this.#buffer.push(...entries);
  }

  #lifecycle(fields: Pick<LifecycleEntry, 'event' | 'persisted' | 'state'>): void {
    this.#push({ kind: 'lifecycle', ...stamp(this.#now(), this.#timeOrigin), ...fields });
  }

  #listen(target: EventTarget, type: string, handler: (event: Event) => void): void {
    target.addEventListener(type, handler);
    this.#stops.push(() => target.removeEventListener(type, handler));
  }

  #observe(
    type: string,
    options: Record<string, unknown>,
    handle: (entries: PerformanceEntry[]) => void,
  ): void {
    const Observer = this.#Observer;
    if (Observer?.supportedEntryTypes?.includes(type) !== true) return;
    const observer = new Observer((list) => handle(list.getEntries()));
    observer.observe({ type, buffered: true, ...options });
    this.#stops.push(() => observer.disconnect());
  }

  /**
   * From the `hashchange` to the next frame, and to just after it: when the new screen could
   * first be painted. React renders it in between, so a slow render shows here.
   */
  readonly #onHashChange = (): void => {
    const start = this.#now();
    const from = this.#routes.at(-1)?.route ?? null;
    const to = routeOfHash(location.hash);
    this.#routes.push({ t: start, route: to });
    if (this.#routes.length > MAX_ROUTES) this.#routes.splice(0, this.#routes.length - MAX_ROUTES);
    this.#frame(() => {
      const nextFrame = this.#now();
      setTimeout(() => {
        this.#push({
          kind: 'route',
          ...stamp(start, this.#timeOrigin),
          from,
          to,
          toNextFrame: round(nextFrame - start),
          toFrameDone: round(this.#now() - start),
        });
      }, 0);
    });
  };

  #session(): SessionEntry {
    const supported = this.#Observer?.supportedEntryTypes ?? [];
    const navigation = performance.getEntriesByType('navigation')[0] as
      PerformanceNavigationTiming | undefined;
    return {
      kind: 'session',
      ...stamp(this.#now(), this.#timeOrigin),
      build: buildName(),
      userAgent: navigator.userAgent,
      deviceMemory: (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? null,
      hardwareConcurrency: navigator.hardwareConcurrency,
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      standalone:
        typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches,
      navigation: navigation?.type ?? null,
      controlled: 'serviceWorker' in navigator && navigator.serviceWorker.controller !== null,
      supports: {
        frames: supported.includes('long-animation-frame'),
        inputs: supported.includes('event'),
      },
    };
  }
}

function readHeap(): number | null {
  return (
    (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ??
    null
  );
}

function persisted(event: Event): boolean {
  return 'persisted' in event && event.persisted === true;
}

/** The entry script's file name, e.g. `index-B3x9.js`: its hash names the build. */
function buildName(): string {
  const src = document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.src ?? '';
  return src === '' ? 'unknown' : src.slice(src.lastIndexOf('/') + 1);
}
