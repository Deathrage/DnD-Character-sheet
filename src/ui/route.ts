import { useEffect, useState } from 'react';
import { SECTIONS, type SectionKey } from './types.js';

/**
 * Spec §7's four screens as a hash route.
 *
 * Hand-rolled rather than `react-router`, which is not installed and is not worth installing for
 * three routes and no data loading, no nested layouts and no code splitting. What spec §7 actually
 * asks of a router is one behaviour — the phone's Back button pops a section, then the hub,
 * without special-casing — and assigning `location.hash` pushes a real history entry, so the
 * platform provides it.
 *
 * Hash and not the History API: this is a local-first app that will be served as static files, and
 * a path-based route would 404 on reload anywhere that is not configured to rewrite to
 * `index.html`.
 *
 * ponytail: hand-rolled hash routing, move to react-router if routes gain nesting, guards or
 * loaders.
 */
export type Route =
  | { name: 'list' }
  | { name: 'character'; id: string; section: SectionKey | null }
  | { name: 'raw'; id: string }
  | { name: 'cloud' }
  | { name: 'legal'; page: LegalPage };

/** The Privacy Policy and the Terms of Use: `#/privacy` and `#/terms`. */
export type LegalPage = 'privacy' | 'terms';

const SECTION_KEYS: readonly string[] = SECTIONS.map((section) => section.key);

/**
 * Anything unrecognised resolves to the list rather than to a not-found screen. A character sheet
 * has one entry point and a bad hash is a typo or a stale bookmark, not a destination.
 *
 * An unknown *section* resolves to the hub instead, for the same reason one level down: the
 * character exists, only the section name is wrong.
 */
export function parseRoute(hash: string): Route {
  const parts = hash
    .replace(/^#\/?/, '')
    .split('/')
    .filter((part) => part !== '');
  if (parts[0] === 'cloud') return { name: 'cloud' };
  if (parts[0] === 'privacy' || parts[0] === 'terms') return { name: 'legal', page: parts[0] };
  const id = parts[1];
  if (parts[0] !== 'c' || id === undefined) return { name: 'list' };

  const tail = parts[2];
  if (tail === 'raw') return { name: 'raw', id: decodeURIComponent(id) };
  return {
    name: 'character',
    id: decodeURIComponent(id),
    section: tail !== undefined && SECTION_KEYS.includes(tail) ? (tail as SectionKey) : null,
  };
}

export function routeHash(route: Route): string {
  if (route.name === 'list') return '#/';
  if (route.name === 'cloud') return '#/cloud';
  if (route.name === 'legal') return `#/${route.page}`;
  const id = encodeURIComponent(route.id);
  if (route.name === 'raw') return `#/c/${id}/raw`;
  return route.section === null ? `#/c/${id}` : `#/c/${id}/${route.section}`;
}

/** Assignment, not `replaceState`: each step must be its own history entry for Back to work. */
export function navigate(route: Route): void {
  globalThis.location.hash = routeHash(route);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(globalThis.location.hash));
  useEffect(() => {
    const read = () => setRoute(parseRoute(globalThis.location.hash));
    globalThis.addEventListener('hashchange', read);
    // Once on mount too: the hash can have changed between the initial `useState` and this
    // effect, and on a cold load with no hash at all this settles the route to the list.
    read();
    return () => globalThis.removeEventListener('hashchange', read);
  }, []);
  return route;
}
