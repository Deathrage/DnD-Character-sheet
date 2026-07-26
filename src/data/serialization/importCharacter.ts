import type { LoadError } from '../migration/errors.js';
import { parseCharacter } from '../migration/parseCharacter.js';
import type { CharacterDocument } from '../schema/index.js';

export type ParseTextResult =
  | { ok: true; doc: CharacterDocument }
  | { ok: false; kind: 'syntax'; message: string }
  | { ok: false; kind: 'document'; error: LoadError; raw: unknown };

export interface FromJsonTextOptions {
  /** The id the imported character will take. Import always creates (spec §5). */
  assignId: string;
}

/**
 * Reads JSON text as a character. Malformed text and an invalid document are
 * reported as different kinds, because the raw-JSON editor presents them
 * differently — a caret position versus a list of field paths (spec §5).
 */
export function fromJsonText(text: string, { assignId }: FromJsonTextOptions): ParseTextResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (caught) {
    return {
      ok: false,
      kind: 'syntax',
      message: caught instanceof Error ? caught.message : 'The file is not valid JSON.',
    };
  }

  const parsed = parseCharacter(raw);
  if (!parsed.ok) {
    return { ok: false, kind: 'document', error: parsed.error, raw: parsed.raw };
  }

  return { ok: true, doc: { ...parsed.doc, id: assignId } };
}
