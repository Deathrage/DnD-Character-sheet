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
/** Both clocks read together: the performance clock started at ORIGIN, with no sleep. */
const CLOCK = { perfNow: 5000, wallNow: ORIGIN + 5000 };
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

const frameContext = { clock: CLOCK, route: null, heap: null };
const inputContext = () => ({
  clock: CLOCK,
  routeAt: () => ({ name: 'list' }) as const,
  seen: new Set<number>(),
});

describe('frameEntry', () => {
  it('stamps the frame and times its phases from its start', () => {
    const entry = frameEntry(frame(), { clock: CLOCK, route: { name: 'list' }, heap: 2048 });
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
