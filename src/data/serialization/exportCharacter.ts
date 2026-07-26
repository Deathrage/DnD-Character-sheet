import { slug } from '../../shared/slug.js';
import type { CharacterDocument } from '../schema/index.js';

/**
 * Pretty-printed on purpose: an exported file exists to be kept in a folder,
 * synced, committed to git and occasionally hand-edited (spec §5).
 */
export function toJsonText(doc: CharacterDocument): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

/** e.g. `sable-nightwind-2026-07-25.json` — sorts chronologically per character. */
export function exportFilename(name: string, now: Date): string {
  return `${slug(name)}-${now.toISOString().slice(0, 10)}.json`;
}
