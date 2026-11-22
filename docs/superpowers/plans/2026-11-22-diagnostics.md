# Diagnostics Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An opt-in diagnostics log, switched on from the character list's menu, that records
slow frames (with the scripts that ran in them), slow taps, screen changes and app lifecycle
events on the player's phone, keeps them in a separate IndexedDB database across launches, and
downloads them as a `.json` file.

**Architecture:** Everything lives in `src/ui/diagnostics/`. `entries.ts` turns what Chrome
reports into log entries (pure, never anything typed into a sheet); `logStore.ts` is the
`dnd-diagnostics` database; `recorder.ts` holds the two `PerformanceObserver`s, the listeners and
a buffer written every 2 s; `index.ts` is the only way in: `startIfOn()` for `main.tsx` and
`useDiagnostics()` for `App`. `CharacterList` gets a Diagnostics menu row and a presentational
`DiagnosticsDialog`.

**Tech Stack:** TypeScript 6, React 19, `idb` 8, Vitest 4 + Testing Library + fake-indexeddb,
Playwright's Chromium for verification.

**Spec:** `docs/superpowers/specs/2026-11-22-diagnostics-design.md`

## Global Constraints

- Nothing typed into a sheet ever reaches the log: no names, descriptions, numbers or character
  ids. An element is its lower-case tag and classes; a route is `parseRoute` without the id; a
  script's `invoker` is cut at the first `[` and to 100 characters (spec §2.2).
- The log is a database of its own, `dnd-diagnostics`, version 1, one store `entries`, created
  with `autoIncrement: true` and **no `keyPath`**. The characters database is not touched.
- The newest **2,000** entries are kept; the oldest are deleted first.
- Entries are written every **2 s**, and at once on `visibilitychange` to hidden and on `pagehide`.
- Slow frames: every `long-animation-frame` entry. Slow taps: `event` entries with
  `durationThreshold: 100`, one `input` entry per `interactionId`, `interactionId` 0 ignored.
  At most **10** scripts per frame, longest first.
- The switch is the localStorage key **`diagnostics:on`**, read and written with
  `readPersisted` / `writePersisted` from `src/ui/persistedState.ts`.
- With the switch off, `recorder.ts` is never loaded (dynamic `import()`).
- A failed log write is dropped with one `console.warn`; it never reaches `StorageGate`, never
  throws into the app.
- Copy, verbatim:
  - menu row label **Diagnostics**; its line **Record slow moments for the developer.** when
    off, **Recording · {n} entries** when on (`1 entry` for one)
  - dialog title **Diagnostics**; checkbox **Record slow moments**; buttons **Download log** and
    **Clear log**
  - hint: **Records how long screens and taps take, and which part of the app was busy. Nothing
    you type into a sheet is recorded. The log stays on this device until you download it.**
  - status: **Nothing recorded yet.**, or **{n} entries since {formatWhen(since)}**
- The file: `dnd-diagnostics-YYYY-MM-DD.json` (the date as `toISOString().slice(0, 10)`, the
  same way `exportFilename` dates a character), contents
  `{ "format": 1, "exportedAt": "<ISO>", "entries": [ …oldest first ] }`.
- `ui` must not import `data` (lint-enforced); `idb` is a package and may be imported.
- `tsconfig.json` has `strict`, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`: an
  optional property is left out, never set to `undefined`.
- Before every commit: `npm test`, `npm run typecheck`, `npm run lint`, `npx prettier --check .`
  (run `npx prettier --write <files>` on the files you touched first).
- Every new test is broken once on purpose to prove it bites, then restored (AGENTS.md, "A test
  can pass for the wrong reason"). Each task names the break to make.
- Commits: Conventional Commit prefixes, each message ending with these two lines:

  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01DKF6kwxeicHETuEwASy3sg
  ```

---

## File map

| File | Change |
|---|---|
| `src/ui/diagnostics/entries.ts` (+ `entries.test.ts`) | Create: entry types and the pure builders |
| `src/ui/diagnostics/logStore.ts` (+ `logStore.test.ts`) | Create: the `dnd-diagnostics` database |
| `src/ui/diagnostics/recorder.ts` (+ `recorder.test.ts`) | Create: observers, listeners, buffer |
| `src/ui/diagnostics/index.ts` (+ `index.test.tsx`) | Create: `startIfOn`, `useDiagnostics` |
| `src/ui/types.ts` | Add `DiagnosticsView` |
| `src/main.tsx` | Call `startIfOn()` before the first render |
| `src/ui/components/icons.tsx` | Add `pulse` |
| `src/ui/components/DiagnosticsDialog.tsx` | Create: the dialog, and `countEntries` |
| `src/ui/screens/CharacterList.tsx` (+ test) | The menu row and the dialog |
| `src/ui/App.tsx` (+ test) | Wire `useDiagnostics`; `download()` takes any `{ filename, text }` |
| `src/ui/screens/Legal.tsx` | One sentence in "Storage on your device"; `UPDATED` |
| `AGENTS.md`, the spec | Record what was built and verified |

---

### Task 1: Log entries

**Files:**
- Create: `src/ui/diagnostics/entries.ts`
- Test: `src/ui/diagnostics/entries.test.ts`

**Interfaces:**
- Consumes: `parseRoute(hash: string): Route` and `type Route` from `src/ui/route.ts`.
- Produces (used by Tasks 2–4): types `LogEntry`, `SessionEntry`, `FrameEntry`, `InputEntry`,
  `RouteEntry`, `LifecycleEntry`, `RouteLabel`, `RouteMark`, `LongAnimationFrameTiming`,
  `ScriptTiming`, `EventTiming`; functions `round(ms)`, `stamp(t, timeOrigin)`,
  `routeOfHash(hash)`, `routeAt(history, t)`, `describeElement(node)`,
  `sanitiseInvoker(invoker)`, `sourcePath(url)`,
  `frameEntry(entry, { timeOrigin, route, heap })`,
  `inputEntries(entries, { timeOrigin, routeAt, seen })`.

- [ ] **Step 1: Write the failing tests**

Create `src/ui/diagnostics/entries.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  describeElement,
  frameEntry,
  inputEntries,
  routeAt,
  routeOfHash,
  sanitiseInvoker,
  sourcePath,
  type EventTiming,
  type LongAnimationFrameTiming,
  type RouteMark,
  type ScriptTiming,
} from './entries.js';

const ORIGIN = Date.UTC(2026, 10, 22, 17, 0, 0);
const ID = 'e4c315d2-310f-454b-82c5-ad649abaa300';

const script = (overrides: Partial<ScriptTiming> = {}): ScriptTiming => ({
  invoker: 'DIV#root.onclick',
  invokerType: 'event-listener',
  sourceURL: 'https://dnd-character-sheet-64a24.web.app/assets/index-B3x9.js',
  sourceFunctionName: 'dispatchEvent',
  sourceCharPosition: 12345,
  duration: 10,
  forcedStyleAndLayoutDuration: 0,
  pauseDuration: 0,
  ...overrides,
});

const frame = (overrides: Partial<LongAnimationFrameTiming> = {}): LongAnimationFrameTiming => ({
  startTime: 1000,
  duration: 120,
  renderStart: 1100,
  styleAndLayoutStart: 1105,
  blockingDuration: 70,
  scripts: [script()],
  ...overrides,
});

const event = (overrides: Partial<EventTiming> = {}): EventTiming => ({
  name: 'click',
  startTime: 2000,
  duration: 160,
  processingStart: 2010,
  processingEnd: 2050,
  interactionId: 7,
  target: null,
  ...overrides,
});

const frameContext = { timeOrigin: ORIGIN, route: null, heap: null };
const inputContext = () => ({
  timeOrigin: ORIGIN,
  routeAt: () => ({ name: 'list' }) as const,
  seen: new Set<number>(),
});

describe('frameEntry', () => {
  it('stamps the frame and times its phases from its start', () => {
    const entry = frameEntry(frame(), { timeOrigin: ORIGIN, route: { name: 'list' }, heap: 2048 });
    expect(entry).toMatchObject({
      kind: 'frame',
      at: '2026-11-22T17:00:01.000Z',
      t: 1000,
      duration: 120,
      blockingDuration: 70,
      renderStart: 100,
      styleAndLayoutStart: 105,
      route: { name: 'list' },
      heap: 2048,
    });
  });

  it('says null for a phase the frame never reached', () => {
    const entry = frameEntry(frame({ renderStart: 0, styleAndLayoutStart: 0 }), frameContext);
    expect(entry.renderStart).toBeNull();
    expect(entry.styleAndLayoutStart).toBeNull();
  });

  it('keeps the ten longest scripts, longest first', () => {
    const scripts = Array.from({ length: 12 }, (_, i) => script({ duration: i + 1 }));
    const entry = frameEntry(frame({ scripts }), frameContext);
    expect(entry.scripts.map((kept) => kept.duration)).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4, 3]);
  });

  it("keeps a script's path and position, never its origin", () => {
    const [kept] = frameEntry(frame(), frameContext).scripts;
    expect(kept).toMatchObject({
      sourceURL: '/assets/index-B3x9.js',
      sourceCharPosition: 12345,
      sourceFunctionName: 'dispatchEvent',
      invoker: 'DIV#root.onclick',
    });
  });
});

describe('sanitiseInvoker', () => {
  it('cuts what Chrome appends about an image, whose src may be a portrait', () => {
    expect(sanitiseInvoker('IMG[src=data:image/jpeg;base64,/9j/4AAQ].onload')).toBe('IMG');
  });

  it('cuts to 100 characters', () => {
    expect(sanitiseInvoker('x'.repeat(150))).toHaveLength(100);
  });

  it('leaves an ordinary invoker alone', () => {
    expect(sanitiseInvoker('BUTTON#b.onclick')).toBe('BUTTON#b.onclick');
  });
});

describe('sourcePath', () => {
  it('keeps the path of a URL', () => {
    expect(sourcePath('https://example.com/assets/index-B3x9.js')).toBe('/assets/index-B3x9.js');
  });

  it('keeps nothing of a data URL', () => {
    expect(sourcePath('data:text/javascript,alert(1)')).toBe('data:');
  });

  it('leaves an empty source empty', () => {
    expect(sourcePath('')).toBe('');
  });
});

describe('describeElement', () => {
  it('names an element by its tag and classes, never its label or text', () => {
    const button = document.createElement('button');
    button.className = 'prep on';
    button.setAttribute('aria-label', 'Fire Bolt prepared');
    button.textContent = 'Fire Bolt';
    expect(describeElement(button)).toBe('button.prep.on');
  });

  it('is null for no element, or for text', () => {
    expect(describeElement(null)).toBeNull();
    expect(describeElement(document.createTextNode('Fire Bolt'))).toBeNull();
  });
});

describe('routeOfHash', () => {
  it('never carries the character id', () => {
    expect(routeOfHash(`#/c/${ID}/spells`)).toEqual({ name: 'character', section: 'spells' });
    expect(routeOfHash(`#/c/${ID}`)).toEqual({ name: 'character', section: null });
    expect(routeOfHash(`#/c/${ID}/raw`)).toEqual({ name: 'raw' });
    expect(routeOfHash('#/privacy')).toEqual({ name: 'legal', page: 'privacy' });
    expect(routeOfHash('#/cloud')).toEqual({ name: 'cloud' });
    expect(routeOfHash('#/')).toEqual({ name: 'list' });
  });
});

describe('routeAt', () => {
  const history: RouteMark[] = [
    { t: 0, route: { name: 'list' } },
    { t: 500, route: { name: 'cloud' } },
  ];

  it('is the last change at or before the time', () => {
    expect(routeAt(history, 499)).toEqual({ name: 'list' });
    expect(routeAt(history, 500)).toEqual({ name: 'cloud' });
  });

  it('is null before the first known route', () => {
    expect(routeAt(history, -1)).toBeNull();
  });
});

describe('inputEntries', () => {
  it('makes one entry per interaction, from its longest event', () => {
    const entries = inputEntries(
      [
        event({ name: 'pointerdown', duration: 152 }),
        event({ name: 'click', duration: 160 }),
        event({ name: 'pointerup', duration: 160 }),
      ],
      inputContext(),
    );
    expect(entries.map((entry) => entry.name)).toEqual(['click']);
  });

  it('ignores events that are not an interaction', () => {
    expect(inputEntries([event({ interactionId: 0 })], inputContext())).toEqual([]);
  });

  it('records an interaction once across batches', () => {
    const context = inputContext();
    inputEntries([event()], context);
    expect(inputEntries([event()], context)).toEqual([]);
  });

  it('splits the duration into delay, handlers and the wait for paint', () => {
    const [entry] = inputEntries([event()], inputContext());
    expect(entry).toMatchObject({
      kind: 'input',
      at: '2026-11-22T17:00:02.000Z',
      t: 2000,
      duration: 160,
      inputDelay: 10,
      processing: 40,
      presentationDelay: 110,
      route: { name: 'list' },
    });
  });

  it('names the target by tag and classes only', () => {
    const button = document.createElement('button');
    button.className = 'back';
    button.setAttribute('aria-label', 'Back to sections');
    const [entry] = inputEntries([event({ target: button })], inputContext());
    expect(entry?.target).toBe('button.back');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/ui/diagnostics/entries.test.ts`
Expected: FAIL — `Failed to resolve import "./entries.js"`.

- [ ] **Step 3: Write the implementation**

Create `src/ui/diagnostics/entries.ts`:

```ts
import { parseRoute, type Route } from '../route.js';

/**
 * What one diagnostics log entry says, and the pure functions that build one from what Chrome
 * reports (spec 2026-11-22 §2).
 *
 * Nothing here reads a sheet. An element is its tag and classes, never its text or label, which
 * name spells and items. A route has no character id. A script's invoker is cut before anything
 * Chrome appends about an image's `src`, because a portrait's `src` is the portrait.
 */

/** Chrome's `long-animation-frame` entry, as far as it is read. TypeScript 6's DOM lib lacks it. */
export interface LongAnimationFrameTiming {
  readonly startTime: number;
  readonly duration: number;
  /** 0 when the frame never reached rendering. */
  readonly renderStart: number;
  readonly styleAndLayoutStart: number;
  readonly blockingDuration: number;
  readonly scripts: readonly ScriptTiming[];
}

/** One script inside a long animation frame. */
export interface ScriptTiming {
  readonly invoker: string;
  readonly invokerType: string;
  readonly sourceURL: string;
  readonly sourceFunctionName: string;
  readonly sourceCharPosition: number;
  readonly duration: number;
  readonly forcedStyleAndLayoutDuration: number;
  readonly pauseDuration: number;
}

/** The fields of an `event` entry (`PerformanceEventTiming`) read here. */
export interface EventTiming {
  readonly name: string;
  readonly startTime: number;
  readonly duration: number;
  readonly processingStart: number;
  readonly processingEnd: number;
  readonly interactionId: number;
  readonly target: Node | null;
}

/** A route as the log records it: `parseRoute`'s result without the character id. */
export type RouteLabel =
  | { name: 'list' }
  | { name: 'cloud' }
  | { name: 'raw' }
  | { name: 'character'; section: string | null }
  | { name: 'legal'; page: string };

/** A screen change, kept so that a frame can be told which screen it started on. */
export interface RouteMark {
  t: number;
  route: RouteLabel;
}

/** When an entry happened: wall-clock, and milliseconds on `performance.now()`'s clock. */
export interface Stamp {
  at: string;
  t: number;
}

export interface ScriptEntry {
  invokerType: string;
  invoker: string;
  sourceURL: string;
  sourceFunctionName: string;
  sourceCharPosition: number;
  duration: number;
  forcedStyleAndLayoutDuration: number;
  pauseDuration: number;
}

export interface SessionEntry extends Stamp {
  kind: 'session';
  /** The entry script's file name, e.g. `index-B3x9.js`: which build wrote the log. */
  build: string;
  userAgent: string;
  deviceMemory: number | null;
  hardwareConcurrency: number | null;
  viewport: { width: number; height: number; dpr: number };
  standalone: boolean;
  navigation: string | null;
  controlled: boolean;
  supports: { frames: boolean; inputs: boolean };
}

export interface FrameEntry extends Stamp {
  kind: 'frame';
  duration: number;
  blockingDuration: number;
  /** Milliseconds from the frame's start, or null when the frame never got that far. */
  renderStart: number | null;
  styleAndLayoutStart: number | null;
  route: RouteLabel | null;
  heap: number | null;
  scripts: ScriptEntry[];
}

export interface InputEntry extends Stamp {
  kind: 'input';
  name: string;
  duration: number;
  inputDelay: number;
  processing: number;
  presentationDelay: number;
  target: string | null;
  route: RouteLabel | null;
}

export interface RouteEntry extends Stamp {
  kind: 'route';
  from: RouteLabel | null;
  to: RouteLabel;
  toNextFrame: number;
  toFrameDone: number;
}

export interface LifecycleEntry extends Stamp {
  kind: 'lifecycle';
  event: string;
  persisted?: boolean;
  state?: string;
}

export type LogEntry = SessionEntry | FrameEntry | InputEntry | RouteEntry | LifecycleEntry;

const MAX_SCRIPTS = 10;
const MAX_INVOKER = 100;
const MAX_SOURCE = 200;

/** One decimal place: enough for a timing in milliseconds, and a smaller log. */
export function round(ms: number): number {
  return Math.round(ms * 10) / 10;
}

export function stamp(t: number, timeOrigin: number): Stamp {
  return { at: new Date(timeOrigin + t).toISOString(), t: round(t) };
}

function routeLabel(route: Route): RouteLabel {
  switch (route.name) {
    case 'character':
      return { name: 'character', section: route.section };
    case 'legal':
      return { name: 'legal', page: route.page };
    case 'raw':
      return { name: 'raw' };
    case 'cloud':
      return { name: 'cloud' };
    case 'list':
      return { name: 'list' };
  }
}

export function routeOfHash(hash: string): RouteLabel {
  return routeLabel(parseRoute(hash));
}

/** The route showing at `t`: the last change at or before it. `history` is in time order. */
export function routeAt(history: readonly RouteMark[], t: number): RouteLabel | null {
  let route: RouteLabel | null = null;
  for (const mark of history) {
    if (mark.t > t) break;
    route = mark.route;
  }
  return route;
}

/** `button.back`: tag and classes, and nothing a player typed. */
export function describeElement(node: Node | null): string | null {
  // 1 is `Node.ELEMENT_NODE`, written out so this also runs where `Node` is not a global.
  if (node === null || node.nodeType !== 1) return null;
  const element = node as Element;
  return element.tagName.toLowerCase() + [...element.classList].map((name) => `.${name}`).join('');
}

/** Chrome may append `[src=…]` for an image, and a portrait's `src` is the portrait. */
export function sanitiseInvoker(invoker: string): string {
  const bracket = invoker.indexOf('[');
  return (bracket === -1 ? invoker : invoker.slice(0, bracket)).slice(0, MAX_INVOKER);
}

/** The path of a script's URL: which bundle file, not which origin. */
export function sourcePath(url: string): string {
  if (url.startsWith('data:')) return 'data:';
  try {
    return new URL(url).pathname.slice(0, MAX_SOURCE);
  } catch {
    return url.slice(0, MAX_SOURCE);
  }
}

function scriptEntry(script: ScriptTiming): ScriptEntry {
  return {
    invokerType: script.invokerType,
    invoker: sanitiseInvoker(script.invoker),
    sourceURL: sourcePath(script.sourceURL),
    sourceFunctionName: script.sourceFunctionName.slice(0, MAX_INVOKER),
    sourceCharPosition: script.sourceCharPosition,
    duration: round(script.duration),
    forcedStyleAndLayoutDuration: round(script.forcedStyleAndLayoutDuration),
    pauseDuration: round(script.pauseDuration),
  };
}

const sinceStart = (mark: number, start: number): number | null =>
  mark > 0 ? round(mark - start) : null;

export function frameEntry(
  entry: LongAnimationFrameTiming,
  context: { timeOrigin: number; route: RouteLabel | null; heap: number | null },
): FrameEntry {
  return {
    kind: 'frame',
    ...stamp(entry.startTime, context.timeOrigin),
    duration: round(entry.duration),
    blockingDuration: round(entry.blockingDuration),
    renderStart: sinceStart(entry.renderStart, entry.startTime),
    styleAndLayoutStart: sinceStart(entry.styleAndLayoutStart, entry.startTime),
    route: context.route,
    heap: context.heap,
    scripts: [...entry.scripts]
      .sort((a, b) => b.duration - a.duration)
      .slice(0, MAX_SCRIPTS)
      .map(scriptEntry),
  };
}

/**
 * One entry per interaction. Chrome reports a tap as several events (`pointerdown`,
 * `pointerup`, `click`) sharing an `interactionId`; the longest stands for them all. Events with
 * `interactionId` 0 (hover, pointer enter and leave) are not interactions. `seen` carries the
 * ids already recorded from one batch to the next, and is added to.
 */
export function inputEntries(
  entries: readonly EventTiming[],
  context: {
    timeOrigin: number;
    routeAt: (t: number) => RouteLabel | null;
    seen: Set<number>;
  },
): InputEntry[] {
  const longest = new Map<number, EventTiming>();
  for (const entry of entries) {
    if (entry.interactionId === 0 || context.seen.has(entry.interactionId)) continue;
    const kept = longest.get(entry.interactionId);
    if (kept === undefined || entry.duration > kept.duration) {
      longest.set(entry.interactionId, entry);
    }
  }
  return [...longest].map(([id, entry]) => {
    context.seen.add(id);
    const inputDelay = round(entry.processingStart - entry.startTime);
    const processing = round(entry.processingEnd - entry.processingStart);
    return {
      kind: 'input',
      ...stamp(entry.startTime, context.timeOrigin),
      name: entry.name,
      duration: round(entry.duration),
      inputDelay,
      processing,
      // The rest of the duration: Chrome rounds `duration` to 8 ms, so this can be a few
      // milliseconds off, or below 0. Reported as it falls rather than clamped.
      presentationDelay: round(entry.duration - inputDelay - processing),
      target: describeElement(entry.target),
      route: context.routeAt(entry.startTime),
    };
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/ui/diagnostics/entries.test.ts`
Expected: PASS, 20 tests.

- [ ] **Step 5: Prove the tests bite**

Make each break, run the file, see only the named test(s) fail, then restore:
- `sanitiseInvoker`: return `invoker.slice(0, MAX_INVOKER)` → "cuts what Chrome appends…" fails.
- `describeElement`: append `+ (element.getAttribute('aria-label') ?? '')` → both "tag and
  classes" tests fail.
- `routeLabel`: return `route` itself for `'character'` → "never carries the character id" fails.
- `frameEntry`: drop `.sort(...)` → "keeps the ten longest scripts" fails.
- `inputEntries`: remove the `context.seen.has(...)` check → "records an interaction once" fails.

- [ ] **Step 6: Typecheck, lint, format, commit**

```bash
npx prettier --write src/ui/diagnostics/
npm run typecheck && npm run lint && npx prettier --check .
git add src/ui/diagnostics/entries.ts src/ui/diagnostics/entries.test.ts
git commit -m "feat(ui): diagnostics log entries, built from what Chrome reports

Pure builders for slow frames, slow taps and routes. An element is its
tag and classes, a route has no character id, and a script's invoker
is cut before anything Chrome appends about an image's src.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DKF6kwxeicHETuEwASy3sg"
```

---

### Task 2: Log store

**Files:**
- Create: `src/ui/diagnostics/logStore.ts`
- Test: `src/ui/diagnostics/logStore.test.ts`

**Interfaces:**
- Consumes: `type LogEntry` from Task 1.
- Produces: `interface LogStore { append(entries: readonly LogEntry[]): Promise<void>;
  readAll(): Promise<LogEntry[]>; count(): Promise<number>; oldest(): Promise<LogEntry | null>;
  clear(): Promise<void> }`, `createLogStore(options?: { name?: string; cap?: number }): LogStore`,
  constants `DB_NAME = 'dnd-diagnostics'`, `MAX_ENTRIES = 2000`.

- [ ] **Step 1: Write the failing tests**

Create `src/ui/diagnostics/logStore.test.ts` (node environment; `src/test/setupIndexedDb.ts`
already installs fake-indexeddb for every test file):

```ts
import { describe, expect, it } from 'vitest';
import type { LogEntry } from './entries.js';
import { createLogStore, MAX_ENTRIES } from './logStore.js';

/** A database per test: fake-indexeddb keeps them for the whole file. */
let databases = 0;
const fresh = (cap?: number) =>
  createLogStore({ name: `diagnostics-test-${++databases}`, ...(cap === undefined ? {} : { cap }) });

const entry = (t: number): LogEntry => ({
  kind: 'lifecycle',
  event: 'resume',
  at: new Date(t).toISOString(),
  t,
});

describe('createLogStore', () => {
  it('reads entries back oldest first, across appends', async () => {
    const store = fresh();
    await store.append([entry(1), entry(2)]);
    await store.append([entry(3)]);
    expect((await store.readAll()).map((kept) => kept.t)).toEqual([1, 2, 3]);
  });

  it('keeps only the newest entries past the cap', async () => {
    const store = fresh(3);
    await store.append([entry(1), entry(2)]);
    await store.append([entry(3), entry(4), entry(5)]);
    expect((await store.readAll()).map((kept) => kept.t)).toEqual([3, 4, 5]);
    expect(await store.count()).toBe(3);
  });

  it('caps at 2,000 entries unless told otherwise', () => {
    expect(MAX_ENTRIES).toBe(2000);
  });

  it('names the oldest entry, or none', async () => {
    const store = fresh();
    expect(await store.oldest()).toBeNull();
    await store.append([entry(1), entry(2)]);
    expect((await store.oldest())?.t).toBe(1);
  });

  it('clears', async () => {
    const store = fresh();
    await store.append([entry(1)]);
    await store.clear();
    expect(await store.count()).toBe(0);
    expect(await store.readAll()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/ui/diagnostics/logStore.test.ts`
Expected: FAIL — `Failed to resolve import "./logStore.js"`.

- [ ] **Step 3: Write the implementation**

Create `src/ui/diagnostics/logStore.ts`:

```ts
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { LogEntry } from './entries.js';

/**
 * The diagnostics log's own IndexedDB database (spec 2026-11-22 §4).
 *
 * Not a store in the characters database: adding one there means bumping its `DB_VERSION`,
 * which waits on every other open tab and locks older builds out, and a debugging tool must
 * never risk that. Keys are generated (`autoIncrement`, no `keyPath`), so a key is never read
 * from a stored value, for the same reason the characters store never does.
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

  /** Opened on first use, so a player who never turns diagnostics on never creates it. */
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
      return (await db()).getAll('entries');
    },
    async count() {
      return (await db()).count('entries');
    },
    async oldest() {
      const cursor = await (await db()).transaction('entries').store.openCursor();
      return cursor?.value ?? null;
    },
    async clear() {
      await (await db()).clear('entries');
    },
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/ui/diagnostics/logStore.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Prove the tests bite**

Make each break, run, see only the named test fail, restore:
- Delete the `if (excess > 0) { … }` block → "keeps only the newest entries past the cap" fails.
- Change `IDBKeyRange.upperBound(newestDropped)` to `IDBKeyRange.lowerBound(newestDropped)` →
  the same test fails (it would delete the newest).
- `oldest()`: open the cursor with `'prev'` → "names the oldest entry" fails.

- [ ] **Step 6: Typecheck, lint, format, commit**

```bash
npx prettier --write src/ui/diagnostics/
npm run typecheck && npm run lint && npx prettier --check .
git add src/ui/diagnostics/logStore.ts src/ui/diagnostics/logStore.test.ts
git commit -m "feat(ui): the diagnostics log's own IndexedDB database

A database of its own, so the characters database's version is never
touched. Generated keys, newest 2,000 entries kept.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DKF6kwxeicHETuEwASy3sg"
```

---

### Task 3: Recorder

**Files:**
- Create: `src/ui/diagnostics/recorder.ts`
- Test: `src/ui/diagnostics/recorder.test.ts`

**Interfaces:**
- Consumes: from Task 1 `frameEntry`, `inputEntries`, `routeAt`, `routeOfHash`, `round`,
  `stamp`, types `EventTiming`, `LifecycleEntry`, `LogEntry`, `LongAnimationFrameTiming`,
  `RouteMark`, `SessionEntry`; from Task 2 `type LogStore`.
- Produces (used by Task 4): `class Recorder { constructor(options: RecorderOptions);
  start(): void; stop(): Promise<void>; flush(): Promise<void>; readonly recording: boolean }`,
  `interface RecorderOptions`, `interface ObserverConstructor`.

- [ ] **Step 1: Write the failing tests**

Create `src/ui/diagnostics/recorder.test.ts`:

```ts
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
    timeOrigin: ORIGIN,
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
    recorder().start();
    expect(append).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    expect(written.map((entry) => entry.kind)).toEqual(['session']);

    FakeObserver.of('long-animation-frame').emit([loaf()]);
    await vi.advanceTimersByTimeAsync(1999);
    expect(append).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(written.map((entry) => entry.kind)).toEqual(['session', 'frame']);
  });

  it('observes both entry types buffered, and taps from 100 ms', () => {
    recorder().start();
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
    made.start();
    await made.flush();
    expect(FakeObserver.all).toEqual([]);
    expect(written[0]).toMatchObject({
      kind: 'session',
      supports: { frames: false, inputs: false },
    });
  });

  it('labels a frame with the screen it started on', async () => {
    const made = recorder();
    made.start();
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

  it('times a screen change to the frame after it, and records no id', async () => {
    const made = recorder();
    made.start();
    await vi.advanceTimersByTimeAsync(1000);
    history.replaceState(null, '', `#/c/${ID}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await vi.advanceTimersByTimeAsync(16);
    await made.flush();
    expect(written.find(isRoute)).toEqual({
      kind: 'route',
      at: new Date(ORIGIN + 1000).toISOString(),
      t: 1000,
      from: { name: 'character', section: 'spells' },
      to: { name: 'character', section: null },
      toNextFrame: 16,
      toFrameDone: 16,
    });
    expect(JSON.stringify(written)).not.toContain(ID);
  });

  it('writes at once when the app is hidden, and on pagehide', async () => {
    recorder().start();
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
    made.start();
    FakeObserver.of('long-animation-frame').emit([loaf()]);
    await made.stop();
    expect(made.recording).toBe(false);
    expect(FakeObserver.all.every((observer) => observer.disconnected)).toBe(true);
    expect(written.map((entry) => entry.kind)).toEqual(['session', 'frame']);

    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await vi.advanceTimersByTimeAsync(5000);
    expect(written).toHaveLength(2);
  });

  it('never throws when the store refuses a batch', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    append.mockImplementation(() => Promise.reject(new Error('QuotaExceededError')));
    const made = recorder();
    made.start();
    await expect(made.flush()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/ui/diagnostics/recorder.test.ts`
Expected: FAIL — `Failed to resolve import "./recorder.js"`.

- [ ] **Step 3: Write the implementation**

Create `src/ui/diagnostics/recorder.ts`:

```ts
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
      | PerformanceNavigationTiming
      | undefined;
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
```

Note on `hardwareConcurrency`: the field is `number | null` in `SessionEntry` and the DOM types
call it a plain `number`, so no `?? null` is needed.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/ui/diagnostics/recorder.test.ts`
Expected: PASS, 8 tests. If "times a screen change" reports `toFrameDone` above 16, the fake
`setTimeout(…, 0)` queued inside the 16 ms callback ran on a later tick: check that
`advanceTimersByTimeAsync(16)` is used (it runs timers queued during the advance), not the
synchronous `advanceTimersByTime`.

- [ ] **Step 5: Prove the tests bite**

Make each break, run, see only the named test fail, restore:
- In `start()`, delete the `visibilitychange` listener's `void this.flush()` → "writes at once
  when the app is hidden" fails.
- In `stop()`, drop the `await this.flush()` → "stop disconnects…" fails on the kinds.
- In `flush()`, remove the `try`/`catch` (keep the `await`) → "never throws when the store
  refuses" fails.
- In `start()`, change `routeAt(this.#routes, entry.startTime)` to `this.#routes.at(-1)?.route
  ?? null` → "labels a frame with the screen it started on" fails.
- In `#onHashChange`, record `location.hash` as `to` → "records no id" fails.

- [ ] **Step 6: Typecheck, lint, format, commit**

```bash
npx prettier --write src/ui/diagnostics/
npm run typecheck && npm run lint && npx prettier --check .
git add src/ui/diagnostics/recorder.ts src/ui/diagnostics/recorder.test.ts
git commit -m "feat(ui): record slow frames, slow taps and screen changes

Two PerformanceObservers and the page's lifecycle events, buffered
and written every 2 s, and at once when the app is hidden. A failed
write is dropped with a warning and never reaches the app.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DKF6kwxeicHETuEwASy3sg"
```

---

### Task 4: The switch and the hook

**Files:**
- Modify: `src/ui/types.ts` (append `DiagnosticsView`)
- Create: `src/ui/diagnostics/index.ts`
- Test: `src/ui/diagnostics/index.test.tsx`
- Modify: `src/main.tsx`

**Interfaces:**
- Consumes: `Recorder` (Task 3), `createLogStore` (Task 2), `readPersisted(key, initial)` and
  `writePersisted(key, value)` from `src/ui/persistedState.ts`.
- Produces (used by Task 5): `interface DiagnosticsView { on: boolean; count: number;
  since: string | null }` in `src/ui/types.ts`; from `src/ui/diagnostics/index.ts`:
  `startIfOn(): void`, `isRecording(): boolean`, and
  `useDiagnostics(): { view: DiagnosticsView; refresh(): Promise<void>;
  setOn(on: boolean): Promise<void>; logFile(now?: Date): Promise<{ filename: string;
  text: string } | null>; clear(): Promise<void> }`.

- [ ] **Step 1: Add the view type**

Append to `src/ui/types.ts`:

```ts
/**
 * The diagnostics log as the list menu shows it (spec 2026-11-22 §5). Not about a character:
 * the log is the app's, kept by `src/ui/diagnostics/`.
 */
export interface DiagnosticsView {
  on: boolean;
  count: number;
  /** The oldest entry's wall-clock time, or null while the log is empty. */
  since: string | null;
}
```

- [ ] **Step 2: Write the failing tests**

Create `src/ui/diagnostics/index.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LogEntry } from './entries.js';

/** The recorder is the one part loaded lazily: these tests count how often it is built. */
const { built } = vi.hoisted(() => ({ built: vi.fn() }));
vi.mock('./recorder.js', () => ({
  Recorder: class {
    start = vi.fn();
    flush = vi.fn(() => Promise.resolve());
    stop = vi.fn(() => Promise.resolve());
    constructor(options: unknown) {
      built(options);
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/ui/diagnostics/index.test.tsx`
Expected: FAIL — `Failed to resolve import "./index.js"`.

- [ ] **Step 4: Write the implementation**

Create `src/ui/diagnostics/index.ts`:

```ts
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/ui/diagnostics/index.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 6: Start it from `main.tsx`**

In `src/main.tsx`, add the import beside the theme import:

```ts
import { startIfOn } from './ui/diagnostics/index.js';
```

and directly after `applyTheme(storedTheme());`:

```ts
// Before anything renders too: with diagnostics on, a launch is recorded from its first frames.
startIfOn();
```

- [ ] **Step 7: Prove the tests bite**

Make each break, run, see only the named test fail, restore:
- `startIfOn`: call `start()` unconditionally → "loads no recorder while the switch is off" fails.
- `logFile`: drop `await flush()` and swap `readAll()` for `readAll().then((all) =>
  all.reverse())` → "exports the log as a dated file, oldest first" fails.
- `refresh`: set `since: null` always → "refresh counts the log and dates it" fails.

- [ ] **Step 8: Typecheck, lint, format, full suite, commit**

```bash
npx prettier --write src/ui/diagnostics/ src/ui/types.ts src/main.tsx
npm test && npm run typecheck && npm run lint && npx prettier --check .
git add src/ui/types.ts src/ui/diagnostics/index.ts src/ui/diagnostics/index.test.tsx src/main.tsx
git commit -m "feat(ui): a persisted switch that starts the diagnostics recorder

The switch survives relaunches, and main.tsx starts the recorder
before the first render while it is on. The recorder is loaded only
then.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DKF6kwxeicHETuEwASy3sg"
```

---

### Task 5: The menu row, the dialog, and the download

**Files:**
- Modify: `src/ui/components/icons.tsx` (add `pulse`)
- Create: `src/ui/components/DiagnosticsDialog.tsx`
- Modify: `src/ui/screens/CharacterList.tsx`
- Test: `src/ui/screens/CharacterList.test.tsx`
- Modify: `src/ui/App.tsx`
- Test: `src/ui/App.test.tsx`

**Interfaces:**
- Consumes: `DiagnosticsView` (Task 4, `src/ui/types.ts`); `useDiagnostics()` (Task 4);
  existing `ResponsiveDialog`, `CheckRow`, `ConfirmDelete`, `formatWhen`, `MenuItem` (local to
  `CharacterList.tsx`).
- Produces: `DiagnosticsDialog` component; `countEntries(count: number): string`; new optional
  `CharacterList` props `diagnostics?: DiagnosticsView`, `onSetDiagnostics?(on: boolean): void`,
  `onDownloadDiagnostics?(): void`, `onClearDiagnostics?(): void`.

- [ ] **Step 1: Write the failing list tests**

In `src/ui/screens/CharacterList.test.tsx`, add `DiagnosticsView` to the type import from
`'../types.js'`:

```ts
import type { DiagnosticsView, InstallView } from '../types.js';
```

and append:

```tsx
describe('CharacterList menu: diagnostics', () => {
  const log = (extra: Partial<DiagnosticsView> = {}): DiagnosticsView => ({
    on: false,
    count: 0,
    since: null,
    ...extra,
  });

  it('is absent without a log', () => {
    list();
    expect(screen.queryByRole('button', { name: 'Diagnostics' })).toBeNull();
  });

  it('says what it does while off', () => {
    list({ diagnostics: log() });
    expect(
      screen.getByRole('button', {
        name: 'Diagnostics',
        description: 'Record slow moments for the developer.',
      }),
    ).toBeTruthy();
  });

  it('says how much it holds while on', () => {
    list({ diagnostics: log({ on: true, count: 134 }) });
    expect(
      screen.getByRole('button', { name: 'Diagnostics', description: 'Recording · 134 entries' }),
    ).toBeTruthy();
  });

  it('opens a dialog whose switch, download and clear reach the callbacks', () => {
    const onSetDiagnostics = vi.fn();
    const onDownloadDiagnostics = vi.fn();
    const onClearDiagnostics = vi.fn();
    list({
      diagnostics: log({ count: 3, since: '2026-11-22T17:03:00.000Z' }),
      onSetDiagnostics,
      onDownloadDiagnostics,
      onClearDiagnostics,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Diagnostics' }));
    const dialog = screen.getByRole('dialog', { name: 'Diagnostics' });
    expect(within(dialog).getByText(/^3 entries since /)).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Record slow moments' }));
    expect(onSetDiagnostics).toHaveBeenCalledWith(true);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Download log' }));
    expect(onDownloadDiagnostics).toHaveBeenCalledOnce();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Clear log' }));
    expect(onClearDiagnostics).not.toHaveBeenCalled();
    const confirm = screen.getByRole('dialog', { name: 'Delete?' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete' }));
    expect(onClearDiagnostics).toHaveBeenCalledOnce();
  });

  it('cannot download an empty log, and says it is empty', () => {
    list({ diagnostics: log() });
    fireEvent.click(screen.getByRole('button', { name: 'Diagnostics' }));
    expect(screen.getByRole('button', { name: 'Download log' })).toHaveProperty('disabled', true);
    expect(screen.getByText('Nothing recorded yet.')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the list tests to verify they fail**

Run: `npx vitest run src/ui/screens/CharacterList.test.tsx`
Expected: the five new tests FAIL (typecheck in the editor also flags the unknown props); the
existing ones still pass. "is absent without a log" may already pass: it guards the absent case
and bites in Step 9.

- [ ] **Step 3: Add the icon**

In `src/ui/components/icons.tsx`, add after `json`:

```tsx
  pulse: (
    <svg viewBox="0 0 24 24">
      <path d="M3 12h4l2-6 4 12 2-6h6" />
    </svg>
  ),
```

- [ ] **Step 4: Create the dialog**

Create `src/ui/components/DiagnosticsDialog.tsx`:

```tsx
import { formatWhen } from '../format.js';
import type { DiagnosticsView } from '../types.js';
import { CheckRow } from './CheckRow.js';
import { ConfirmDelete } from './ConfirmDelete.js';
import { ResponsiveDialog } from './ResponsiveDialog.js';

interface Props {
  view: DiagnosticsView;
  onSetOn(on: boolean): void;
  onDownload(): void;
  onClear(): void;
  onClose(): void;
}

/** "1 entry", "134 entries": shared with the menu row's line. */
export function countEntries(count: number): string {
  return count === 1 ? '1 entry' : `${count} entries`;
}

/**
 * The diagnostics log's switch and its two actions (spec 2026-11-22 §5). Presentational: the
 * log itself is `src/ui/diagnostics/`, wired by `App`.
 */
export function DiagnosticsDialog({ view, onSetOn, onDownload, onClear, onClose }: Props) {
  return (
    <ResponsiveDialog
      title="Diagnostics"
      open
      onClose={onClose}
      footer={
        <>
          <ConfirmDelete what="The diagnostics log" onConfirm={onClear}>
            Clear log
          </ConfirmDelete>
          <button
            type="button"
            className="primary"
            disabled={view.count === 0}
            onClick={onDownload}
          >
            Download log
          </button>
        </>
      }
    >
      <CheckRow label="Record slow moments" checked={view.on} onChange={onSetOn} />
      <p className="hint">
        Records how long screens and taps take, and which part of the app was busy. Nothing you
        type into a sheet is recorded. The log stays on this device until you download it.
      </p>
      <p className="hint">
        {view.count === 0
          ? 'Nothing recorded yet.'
          : view.since === null
            ? countEntries(view.count)
            : `${countEntries(view.count)} since ${formatWhen(view.since)}`}
      </p>
    </ResponsiveDialog>
  );
}
```

- [ ] **Step 5: Add the row and the dialog to `CharacterList`**

In `src/ui/screens/CharacterList.tsx`:

1. Imports: add

```ts
import { countEntries, DiagnosticsDialog } from '../components/DiagnosticsDialog.js';
```

and change the types import to

```ts
import type { CharacterRow, CloudView, DiagnosticsView, InstallView } from '../types.js';
```

2. In `interface Props`, after `onOpenLegal?(page: LegalPage): void;` add:

```ts
  /** Absent hides the menu's Diagnostics row: the stories, and any screen without the log. */
  diagnostics?: DiagnosticsView;
  onSetDiagnostics?(on: boolean): void;
  onDownloadDiagnostics?(): void;
  onClearDiagnostics?(): void;
```

3. Destructure them in the function's parameter list after `onOpenLegal,`:

```ts
  diagnostics,
  onSetDiagnostics,
  onDownloadDiagnostics,
  onClearDiagnostics,
```

4. After `const [showingSteps, setShowingSteps] = useState(false);` add:

```ts
  const [showingDiagnostics, setShowingDiagnostics] = useState(false);
```

5. In the menu, directly before the group that holds Privacy Policy and Terms of Use, add:

```tsx
          {diagnostics !== undefined && (
            <ul className="mgroup">
              <MenuItem
                icon={ICONS.pulse}
                label="Diagnostics"
                description={
                  diagnostics.on
                    ? `Recording · ${countEntries(diagnostics.count)}`
                    : 'Record slow moments for the developer.'
                }
                onClick={fromMenu(() => setShowingDiagnostics(true))}
              />
            </ul>
          )}
```

6. After the `showingSteps` dialog block, add:

```tsx
      {showingDiagnostics && diagnostics !== undefined && (
        <DiagnosticsDialog
          view={diagnostics}
          onSetOn={(on) => onSetDiagnostics?.(on)}
          onDownload={() => onDownloadDiagnostics?.()}
          onClear={() => onClearDiagnostics?.()}
          onClose={() => setShowingDiagnostics(false)}
        />
      )}
```

- [ ] **Step 6: Run the list tests to verify they pass**

Run: `npx vitest run src/ui/screens/CharacterList.test.tsx`
Expected: PASS, all tests including the five new ones.

- [ ] **Step 7: Write the failing App test**

In `src/ui/App.test.tsx`, inside `describe('App', …)`, add:

```tsx
  it('turns diagnostics on and off from the menu, and counts what it recorded', async () => {
    renderApp();
    fireEvent.click(await screen.findByRole('button', { name: 'Menu' }));
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Diagnostics',
        description: 'Record slow moments for the developer.',
      }),
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Record slow moments' }));
    await waitFor(() => expect(localStorage.getItem('diagnostics:on')).toBe('true'));
    // The session entry the recorder writes when it starts.
    expect(await screen.findByText(/^1 entry since /)).toBeDefined();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Record slow moments' }));
    await waitFor(() => expect(localStorage.getItem('diagnostics:on')).toBe('false'));
  });
```

Run: `npx vitest run src/ui/App.test.tsx`
Expected: the new test FAILS (no Diagnostics row: `App` does not pass `diagnostics` yet).

- [ ] **Step 8: Wire `App`**

In `src/ui/App.tsx`:

1. Add the import after the `./bind.js` import block:

```ts
import { useDiagnostics } from './diagnostics/index.js';
```

2. In `App`, after `const account = useCloud(cloud);` add:

```ts
  const diagnostics = useDiagnostics();
```

3. In the `<CharacterList … />` props, replace

```tsx
            // Loads Firebase the first time — on opening the menu, never at launch.
            onOpenMenu={() => void cloud.checkSignIn()}
```

with

```tsx
            onOpenMenu={() => {
              // Loads Firebase the first time — on opening the menu, never at launch.
              void cloud.checkSignIn();
              void diagnostics.refresh();
            }}
            diagnostics={diagnostics.view}
            onSetDiagnostics={(on) => void diagnostics.setOn(on)}
            onDownloadDiagnostics={() =>
              void diagnostics.logFile().then((file) => {
                if (file !== null) download(file);
              })
            }
            onClearDiagnostics={() => void diagnostics.clear()}
```

4. Replace the `download` function's doc comment and signature:

```ts
/**
 * Purely a browser affordance: a `CharacterFile` or the diagnostics log knows its name and its
 * text, and only the DOM can put them in the player's downloads. The object URL is revoked
 * immediately — `click()` has already read it synchronously.
 */
function download(file: { filename: string; text: string }): void {
```

(The body is unchanged; `CharacterFile` has `filename` and `text`, so Export still compiles.)

- [ ] **Step 9: Run the tests, and prove the new ones bite**

Run: `npx vitest run src/ui/App.test.tsx src/ui/screens/CharacterList.test.tsx`
Expected: PASS.

Make each break, run, see only the named test fail, restore:
- `CharacterList`: render the Diagnostics group even when `diagnostics` is undefined (use
  `diagnostics?.on` in the line) → "is absent without a log" fails.
- `DiagnosticsDialog`: remove `disabled={view.count === 0}` → "cannot download an empty log"
  fails.
- `DiagnosticsDialog`: replace `ConfirmDelete` with a plain button calling `onClear` → "opens a
  dialog whose switch…" fails at `not.toHaveBeenCalled()`.
- `index.ts`: delete the `await refresh()` at the end of `setOn` → the App test fails at
  "1 entry since" (the count stays 0); the hook's own tests still pass, because `on` is set
  before the refresh.
- `App`: pass `diagnostics={{ on: false, count: 0, since: null }}` instead of
  `diagnostics.view` → the App test fails at "1 entry since".

- [ ] **Step 10: Full suite, typecheck, lint, format, commit**

```bash
npx prettier --write src/ui/components/icons.tsx src/ui/components/DiagnosticsDialog.tsx src/ui/screens/CharacterList.tsx src/ui/screens/CharacterList.test.tsx src/ui/App.tsx src/ui/App.test.tsx
npm test && npm run typecheck && npm run lint && npx prettier --check .
git add src/ui/components/icons.tsx src/ui/components/DiagnosticsDialog.tsx src/ui/screens/CharacterList.tsx src/ui/screens/CharacterList.test.tsx src/ui/App.tsx src/ui/App.test.tsx
git commit -m "feat(ui): a Diagnostics row in the list menu, and the log's download

A switch, the log's size and age, Download log and Clear log. The
file is saved by the same download helper Export uses.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DKF6kwxeicHETuEwASy3sg"
```

---

### Task 6: The privacy page

**Files:**
- Modify: `src/ui/screens/Legal.tsx`

**Interfaces:** none.

- [ ] **Step 1: Add the sentence**

In `src/ui/screens/Legal.tsx`, in the "Storage on your device" paragraph, after the sentence
ending "…keep your Google profile picture in its ordinary cache." insert:

```tsx
          {' '}If you turn on Diagnostics in the menu, the app also keeps a log in IndexedDB of how
          long screens and taps take and which part of the app was busy, never what you typed. It
          leaves your device only if you download it.
```

Format with prettier afterwards; the paragraph's JSX text must read as one paragraph with single
spaces between sentences. Check it in the rendered page in Task 7.

- [ ] **Step 2: Date the change**

Change `const UPDATED = '25 September 2026';` to `const UPDATED = '22 November 2026';`. If the
release happens on a later day, the person merging updates it to that day.

- [ ] **Step 3: Tests, typecheck, lint, format, commit**

```bash
npx prettier --write src/ui/screens/Legal.tsx
npm test && npm run typecheck && npm run lint && npx prettier --check .
git add src/ui/screens/Legal.tsx
git commit -m "docs(legal): the privacy policy says what the diagnostics log keeps

Off by default, timings only, and it leaves the device only when the
player downloads it.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DKF6kwxeicHETuEwASy3sg"
```

---

### Task 7: Verify in Chromium, map a script, record it

**Files:**
- Create (scratch, not committed): `$SCRATCH/verify.cjs`, `$SCRATCH/mapPosition.cjs`, where
  `$SCRATCH` is the session's scratchpad directory
  (`/tmp/claude-0/-home-user-DnD-Character-sheet/058a015d-9d56-58a2-b6ab-c44a184ba962/scratchpad/perf`,
  which already holds `zahir.json` and `measure.cjs`)
- Modify: `AGENTS.md`, `docs/superpowers/specs/2026-11-22-diagnostics-design.md`

**Interfaces:** none.

- [ ] **Step 1: Build and serve production**

```bash
npx vite build
npx vite preview --port 4173 --strictPort   # in the background
```

- [ ] **Step 2: Write the verification script**

Create `$SCRATCH/verify.cjs`:

```js
// Switches diagnostics on from the menu, relaunches, forces a 300 ms back press on the Spell
// List, downloads the log, and checks what is in it.
// usage: node verify.cjs <url> <characterFile> <characterId> <outLog>
const fs = require('fs');
const { chromium } = require('playwright');
const [, , url, file, id, outLog] = process.argv;

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 412, height: 860 }, acceptDownloads: true });
  const page = await context.newPage();
  const gate = async () => {
    await page.getByRole('button', { name: 'Make storage permanent' }).click({ timeout: 5000 }).catch(() => {});
    await page.getByRole('button', { name: /Continue anyway/ }).click({ timeout: 5000 }).catch(() => {});
  };
  await page.goto(url);
  await gate();
  await page.setInputFiles('input[type=file]', file);
  await page.waitForTimeout(1500);

  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('button', { name: 'Diagnostics' }).click();
  await page.getByRole('checkbox', { name: 'Record slow moments' }).check();
  await page.getByRole('button', { name: 'Close' }).click();

  // Recording must survive a relaunch and start before the first render.
  await page.reload();
  await gate();
  await page.evaluate((id) => (location.hash = `#/c/${id}`), id);
  await page.getByRole('button', { name: 'Spell List' }).click();
  await page.waitForSelector('button[aria-label="Back to sections"]');
  await page.evaluate(() =>
    document.querySelector('button.back').addEventListener(
      'click',
      function slowBack() {
        const start = performance.now();
        while (performance.now() - start < 300) {}
      },
      { once: true },
    ),
  );
  await page.click('button[aria-label="Back to sections"]');
  await page.waitForSelector('.contents');
  await page.waitForTimeout(2500);

  await page.evaluate(() => (location.hash = '#/'));
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('button', { name: 'Diagnostics' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download log' }).click(),
  ]);
  const text = fs.readFileSync(await download.path(), 'utf8');
  fs.writeFileSync(outLog, text);
  const log = JSON.parse(text);
  console.log('file name:', download.suggestedFilename());

  const kinds = {};
  for (const entry of log.entries) kinds[entry.kind] = (kinds[entry.kind] ?? 0) + 1;
  console.log('kinds:', kinds);
  console.log('sessions:', log.entries.filter((e) => e.kind === 'session').map((e) => e.build));
  const back = log.entries.find((e) => e.kind === 'route' && e.from?.section === 'spells' && e.to?.section === null);
  console.log('back press route entry:', back);
  const slow = log.entries.filter((e) => e.kind === 'frame' && e.duration >= 300);
  console.log('frames >= 300 ms:', JSON.stringify(slow, null, 1));

  const sheet = JSON.parse(fs.readFileSync(file, 'utf8'));
  const doc = sheet.sheet ?? sheet;
  const all = (c) => [...c.uncategorized, ...c.categories.flatMap((k) => k.items)];
  const secrets = [doc.id, doc.name, ...all(doc.spellList).map((s) => s.name), ...all(doc.featsAndTraits).map((f) => f.name)];
  console.log('character text found in the log:', secrets.filter((s) => text.includes(s)));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 3: Run it**

```bash
cd $SCRATCH && node verify.cjs http://localhost:4173/ zahir.json e4c315d2-310f-454b-82c5-ad649abaa300 log.json
```

Expected:
- file name `dnd-diagnostics-<today>.json`
- `kinds` has two `session` entries (before and after the reload), at least one `route`,
  at least one `frame`, and `lifecycle`
- both `session.build` values equal the `assets/index-*.js` file name in `dist/index.html`
- a `route` entry `{ name: 'character', section: 'spells' } → { name: 'character', section: null }`
- one frame of 300 ms or more whose `scripts` include an `event-listener` script, and one with a
  `sourceURL` under `/assets/`
- `character text found in the log: []`

If any of these is not what the script prints, stop and fix the cause before going on.

- [ ] **Step 4: Measure the recorder's overhead**

Add an opt-in to `$SCRATCH/measure.cjs`, directly after `const page = await context.newPage();`:

```js
  if (process.env.DIAG) await page.addInitScript(() => localStorage.setItem('diagnostics:on', 'true'));
```

Then run each three times at a 6× throttle and compare "hub in DOM":

```bash
cd $SCRATCH
for i in 1 2 3; do node measure.cjs http://localhost:4173/ zahir.json e4c315d2-310f-454b-82c5-ad649abaa300 6 spells | grep cpu; done
for i in 1 2 3; do DIAG=1 node measure.cjs http://localhost:4173/ zahir.json e4c315d2-310f-454b-82c5-ad649abaa300 6 spells | grep cpu; done
```

Expected: the two sets overlap (earlier runs without the recorder: 100–145 ms).

- [ ] **Step 5: Map one script position back to source**

Build the same commit with hidden source maps into a separate directory, and check the entry
file name is the same as the deployed one (a hidden map adds no comment to the JS, so the hash
should not change; if it does, record that in spec §7 and in the result):

```bash
npx vite build --sourcemap hidden --outDir $SCRATCH/dist-map --emptyOutDir
ls dist/assets/index-*.js $SCRATCH/dist-map/assets/index-*.js
```

Create `$SCRATCH/mapPosition.cjs`:

```js
// Maps a frame script's sourceCharPosition to the original file and line.
// usage: node mapPosition.cjs <dist-map dir> <log.json>
const fs = require('fs');
const path = require('path');
const { SourceMapConsumer } = require(path.join(process.cwd(), 'node_modules/source-map-js'));
const [, , distDir, logFile] = process.argv;
const log = JSON.parse(fs.readFileSync(logFile, 'utf8'));
const scripts = log.entries
  .filter((e) => e.kind === 'frame')
  .flatMap((e) => e.scripts)
  .filter((s) => s.sourceURL.startsWith('/assets/') && s.sourceCharPosition >= 0);
for (const script of scripts.slice(0, 5)) {
  const js = path.join(distDir, script.sourceURL);
  const code = fs.readFileSync(js, 'utf8');
  const before = code.slice(0, script.sourceCharPosition);
  const line = before.split('\n').length;
  const column = script.sourceCharPosition - (before.lastIndexOf('\n') + 1);
  const map = new SourceMapConsumer(JSON.parse(fs.readFileSync(`${js}.map`, 'utf8')));
  console.log(script.invoker, script.sourceFunctionName, '→', map.originalPositionFor({ line, column }));
}
```

Run from the repository root:

```bash
node $SCRATCH/mapPosition.cjs $SCRATCH/dist-map $SCRATCH/log.json
```

Expected: each line maps to a file under `src/` or `node_modules/` with a line number (React's
event dispatch maps into `node_modules/react-dom`). If the file names in Step 5 differed, the
mapping is meaningless: say so in the result instead.

- [ ] **Step 6: Check the privacy page renders as one paragraph**

With the preview running, open `http://localhost:4173/#/privacy` in Playwright (or read
`document.querySelector('.legal')` text) and confirm the new sentence sits inside "Storage on
your device" with single spaces around it.

- [ ] **Step 7: Record it**

1. In the spec, change `Status: **designed 2026-11-22**, not built.` to
   `Status: **built 2026-11-22** on branch \`ccr-5527685e-89z8fo\`, from
   \`docs/superpowers/plans/2026-11-22-diagnostics.md\`.` If Step 5 found that the hidden
   source-map build changes the hash, rewrite §7 with what does work.

2. In `AGENTS.md`, under "Current state", after the Schema v8 entry, add:

```markdown
- **A diagnostics log** (2026-11-22). A player saw a few seconds of lag leaving the Spell List
  on an installed Android copy, sometimes, and headless Chromium at a 6× throttle never
  reproduced it. So the list menu has a **Diagnostics** switch: while on, `src/ui/diagnostics/`
  records slow frames (Chrome's Long Animation Frames, with the scripts that ran in them), slow
  taps (Event Timing), every screen change timed to the frame after it, and lifecycle events.
  `docs/superpowers/specs/2026-11-22-diagnostics-design.md` is the design.
  - **Its own database, `dnd-diagnostics`**, never a store in the characters database, whose
    `DB_VERSION` bump would wait on every tab and lock older builds out. Newest 2,000 entries,
    written every 2 s and at once when the app is hidden.
  - **Nothing typed reaches it**: an element is its tag and classes, a route has no id, a
    script's invoker is cut at `[` (Chrome appends an image's `src`, and a portrait's is the
    portrait). The privacy page says so.
  - **Off, it costs nothing**: `recorder.ts` is a dynamic import, loaded only while the switch
    (`diagnostics:on` in localStorage) is on. `main.tsx` starts it before the first render.
  - **Reading a log**: `session.build` names the entry bundle. Build that commit with
    `npx vite build --sourcemap hidden --outDir <dir>`, check the file name matches, and look
    each `sourceCharPosition` up in the `.map`.
  - **Verified in Chromium** (production build): <fill in from Steps 3–6: what the downloaded
    log held, the overhead numbers, and one mapped position>.
```

   Replace the angle-bracketed line with the actual results from Steps 3–6 before committing.
   Also update the test count line ("2847 tests across 103 files") with the numbers `npm test`
   prints, and add `src/ui/diagnostics/` to the Map under `src/ui/`:

```
  diagnostics/         the opt-in diagnostics log: entries.ts (pure, nothing typed), logStore.ts
                       (its own IndexedDB database), recorder.ts (observers, buffer; lazy),
                       index.ts (startIfOn, useDiagnostics — the only way in)
```

- [ ] **Step 8: Stop the preview, run everything, commit, push**

```bash
pkill -f "vite preview"; pkill -f "npm exec vite"
npm test && npm run typecheck && npm run lint && npx prettier --check .
git add AGENTS.md docs/superpowers/specs/2026-11-22-diagnostics-design.md
git commit -m "docs: record the diagnostics log and what was verified

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DKF6kwxeicHETuEwASy3sg"
for i in 1 2 3 4; do git push -u origin ccr-5527685e-89z8fo && break; sleep $((2**i)); done
```
