import { z } from 'zod';
import { toSchemaIssues, type LoadError, type SchemaIssue } from '../migration/errors.js';
import { parseCharacter } from '../migration/parseCharacter.js';
import { portraitSchema } from '../repository/portrait.js';
import type { CharacterDocument } from '../schema/index.js';

export type ParseTextResult =
  | { ok: true; doc: CharacterDocument }
  | { ok: false; kind: 'syntax'; message: string }
  | { ok: false; kind: 'document'; error: LoadError; raw: unknown };

export type ParseFileResult =
  | { ok: true; doc: CharacterDocument; portrait: string | null }
  | Exclude<ParseTextResult, { ok: true }>
  /** The `{ sheet, portrait }` envelope itself is wrong: a bad portrait, or an unknown key. */
  | { ok: false; kind: 'file'; issues: SchemaIssue[] };

export interface FromJsonTextOptions {
  /** The id the character will take. */
  assignId: string;
}

type Parsed = { ok: true; raw: unknown } | { ok: false; kind: 'syntax'; message: string };

function parseJson(text: string): Parsed {
  try {
    return { ok: true, raw: JSON.parse(text) };
  } catch (caught) {
    return {
      ok: false,
      kind: 'syntax',
      message: caught instanceof Error ? caught.message : 'The file is not valid JSON.',
    };
  }
}

function readDocument(raw: unknown, assignId: string | undefined): ParseTextResult {
  const parsed = parseCharacter(raw);
  if (!parsed.ok) {
    return { ok: false, kind: 'document', error: parsed.error, raw: parsed.raw };
  }
  return { ok: true, doc: assignId === undefined ? parsed.doc : { ...parsed.doc, id: assignId } };
}

/**
 * Reads JSON text as a bare character document — what the raw-JSON editor edits. Malformed text
 * and an invalid document are reported as different kinds, because the editor presents them
 * differently — a caret position versus a list of field paths (spec §5).
 */
export function fromJsonText(text: string, { assignId }: FromJsonTextOptions): ParseTextResult {
  const parsed = parseJson(text);
  return parsed.ok ? readDocument(parsed.raw, assignId) : parsed;
}

/**
 * Strict, like every stored shape: an unknown key is reported, never dropped. `sheet` is
 * `unknown` here because it is validated — and migrated — by `parseCharacter`, not by this.
 */
const fileSchema = z.object({ sheet: z.unknown(), portrait: portraitSchema.nullable() }).strict();

/**
 * Reads an exported file: the `{ sheet, portrait }` envelope, or a bare document — every file
 * exported before portraits existed. The two cannot be confused: a document is strict and has
 * no `sheet` key, so the key's presence alone says which shape this is.
 *
 * Without `assignId` the file's own id is kept, so a character this browser already has is
 * recognised as the same one on import, and the player is asked whether to replace it.
 */
export function fromFileText(
  text: string,
  { assignId }: Partial<FromJsonTextOptions> = {},
): ParseFileResult {
  const parsed = parseJson(text);
  if (!parsed.ok) return parsed;

  const { raw } = parsed;
  const isEnvelope =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw) && 'sheet' in raw;
  if (!isEnvelope) {
    const read = readDocument(raw, assignId);
    return read.ok ? { ...read, portrait: null } : read;
  }

  const envelope = fileSchema.safeParse(raw);
  if (!envelope.success) return { ok: false, kind: 'file', issues: toSchemaIssues(envelope.error) };

  const read = readDocument(envelope.data.sheet, assignId);
  return read.ok ? { ...read, portrait: envelope.data.portrait } : read;
}
