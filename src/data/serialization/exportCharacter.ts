import { slug } from '../../shared/slug.js';

/**
 * Pretty-printed on purpose: an exported file exists to be kept in a folder,
 * synced, committed to git and occasionally hand-edited (spec §5).
 * Takes `unknown` so the repair screen can print a document that failed validation.
 */
export function toJsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** e.g. `sable-nightwind-2026-07-25.json` — sorts chronologically per character. */
export function exportFilename(name: string, now: Date): string {
  return `${slug(name)}-${now.toISOString().slice(0, 10)}.json`;
}
