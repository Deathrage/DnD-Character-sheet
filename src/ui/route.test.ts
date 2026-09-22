import { describe, expect, it } from 'vitest';
import { parseRoute, routeHash, type Route } from './route.js';

describe('parseRoute', () => {
  it('reads the three screens', () => {
    expect(parseRoute('#/')).toEqual({ name: 'list' });
    expect(parseRoute('#/c/abc')).toEqual({ name: 'character', id: 'abc', section: null });
    expect(parseRoute('#/c/abc/feats')).toEqual({
      name: 'character',
      id: 'abc',
      section: 'feats',
    });
    expect(parseRoute('#/c/abc/raw')).toEqual({ name: 'raw', id: 'abc' });
  });

  it('treats an empty or unrecognised hash as the list', () => {
    // A character sheet has one entry point; a bad hash is a typo or a stale bookmark.
    for (const hash of ['', '#', '#/', '#/nonsense', '#/c', '#/c/']) {
      expect(parseRoute(hash)).toEqual({ name: 'list' });
    }
  });

  it('falls back to the hub for a section name it does not know', () => {
    // The character exists; only the section is wrong, so it is one level of fallback, not two.
    expect(parseRoute('#/c/abc/nonsense')).toEqual({
      name: 'character',
      id: 'abc',
      section: null,
    });
  });

  it('round-trips every route through its hash', () => {
    const routes: Route[] = [
      { name: 'list' },
      { name: 'character', id: 'abc', section: null },
      { name: 'character', id: 'abc', section: 'abilities' },
      { name: 'raw', id: 'abc' },
    ];
    for (const route of routes) {
      expect(parseRoute(routeHash(route))).toEqual(route);
    }
  });

  it('survives an id that needs escaping', () => {
    // Ids are uuids today, so this is insurance rather than a live case — but a `/` in an id
    // would silently reparse as a section, and a repair screen is exactly where a hand-edited
    // id could come from.
    const id = 'a/b c';
    expect(routeHash({ name: 'raw', id })).toBe('#/c/a%2Fb%20c/raw');
    expect(parseRoute(routeHash({ name: 'raw', id }))).toEqual({ name: 'raw', id });
  });
});
