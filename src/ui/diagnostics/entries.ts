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

/**
 * Both clocks read at the same moment. `at` is the wall clock then, less how long ago `t` was on
 * the performance clock: `performance.now()` stops while an Android device sleeps, so
 * `timeOrigin + t` would be hours early after the app has been in the background.
 */
export interface Clock {
  perfNow: number;
  wallNow: number;
}

export function stamp(t: number, clock: Clock): Stamp {
  return { at: new Date(clock.wallNow - (clock.perfNow - t)).toISOString(), t: round(t) };
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
  context: { clock: Clock; route: RouteLabel | null; heap: number | null },
): FrameEntry {
  return {
    kind: 'frame',
    ...stamp(entry.startTime, context.clock),
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
    clock: Clock;
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
      ...stamp(entry.startTime, context.clock),
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
