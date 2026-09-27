import { readPersisted, writePersisted } from './persistedState.js';

/** `system` follows the device; the other two override it. View state, never in the document. */
export type Theme = 'system' | 'light' | 'dark';

export const THEMES: readonly { value: Theme; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** One setting for the whole app, like the vitals collapse: it is about the screen, not a sheet. */
export const THEME_KEY = 'ui:theme';

export function storedTheme(): Theme {
  const theme = readPersisted<string>(THEME_KEY, 'system');
  return THEMES.some((entry) => entry.value === theme) ? (theme as Theme) : 'system';
}

/** The menu's choice: on the page at once, and remembered for the next launch. */
export function chooseTheme(theme: Theme): void {
  writePersisted(THEME_KEY, theme);
  applyTheme(theme);
}

/**
 * Sets `data-theme` on `<html>`, which `styles.css` reads, or removes it so the stylesheet's
 * `prefers-color-scheme` query decides. The browser's own toolbar colour (the `theme-color` metas
 * in index.html) is switched the same way: an explicit choice pins the matching meta to every
 * device and switches the other off, `system` hands both back to their media queries.
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;

  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const scheme = meta.dataset.scheme;
    meta.media =
      theme === 'system'
        ? `(prefers-color-scheme: ${scheme})`
        : theme === scheme
          ? 'all'
          : 'not all';
  }
}
